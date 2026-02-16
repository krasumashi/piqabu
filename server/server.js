const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const { createSocketRateLimiter, checkBruteForce, recordFailedJoin, clearBruteForceRecord } = require('./middleware/rateLimiter');
const {
    validateJoinRoom,
    validateText,
    validateRevealPayload,
    validateWhisperPayload,
    validateWhisperFilter,
    validateVideoControls,
    validateDeviceId,
    validateRoomId,
    validateInviteFeature,
} = require('./middleware/validation');
const { getTier } = require('./lib/subscriptionStore');
const stripeRoutes = require('./routes/stripe');

const app = express();

// --- Security Middleware ---
app.use(helmet());

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:19006,http://localhost:19000,https://piqabu.onrender.com').split(',');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS not allowed'), false);
    },
}));

// Rate limit HTTP endpoints
const healthLimiter = rateLimit({
    windowMs: 60000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});

app.get('/health', healthLimiter, (req, res) => {
    res.status(200).send('SIGNAL TOWER ACTIVE');
});

// Stripe subscription routes (checkout, status, webhook)
app.use(stripeRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error('CORS not allowed'), false);
        },
        methods: ["GET", "POST"],
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 2e6,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// In-memory room storage: Map<roomId, Set<socketId>>
const rooms = new Map();

// Multi-room participants: Map<socketId, { rooms: Set<roomId>, deviceId: string }>
const participants = new Map();

// Tier room limits
const ROOM_LIMITS = { free: 1, pro: 5 };

// --- CSPRNG Room Code Generation ---
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateSecureRoomCode() {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += ROOM_CHARS[bytes[i] % ROOM_CHARS.length];
    }
    return code;
}

// --- Helper: get or create participant record ---
function getParticipant(socketId) {
    return participants.get(socketId);
}

function ensureParticipant(socket, deviceId) {
    if (!participants.has(socket.id)) {
        participants.set(socket.id, {
            rooms: new Set(),
            deviceId: deviceId || socket.data.deviceId || 'unknown',
        });
    }
    return participants.get(socket.id);
}

// --- Helper: validate roomId from event payload ---
function extractRoomId(data) {
    if (typeof data === 'object' && data !== null && data.roomId) {
        const result = validateRoomId(data.roomId);
        if (result.valid) return result.sanitized;
    }
    return null;
}

// --- Socket.IO Middleware ---
io.use(createSocketRateLimiter());

io.use((socket, next) => {
    const deviceId = socket.handshake.auth?.deviceId;
    if (deviceId) {
        const result = validateDeviceId(deviceId);
        if (!result.valid) {
            return next(new Error('invalid_device_id'));
        }
        socket.data.deviceId = result.sanitized;
        // Look up tier from subscription store
        socket.data.tier = getTier(result.sanitized);
    } else {
        socket.data.tier = 'free';
    }
    next();
});

io.on('connection', (socket) => {
    console.log(`[CONN] Socket connected: ${socket.id}`);

    // Heartbeat
    socket.on('heartbeat', () => {
        socket.emit('heartbeat_ack');
    });

    // --- Server-Side Room Code Generation ---
    socket.on('request_room', (callback) => {
        if (typeof callback !== 'function') return;

        let code;
        let attempts = 0;
        do {
            code = generateSecureRoomCode();
            attempts++;
        } while (rooms.has(code) && attempts < 100);

        if (attempts >= 100) {
            callback({ error: 'UNABLE_TO_GENERATE_CODE' });
            return;
        }

        callback({ roomCode: code });
    });

    // --- Join Room (Multi-Room Aware) ---
    socket.on('join_room', (data) => {
        if (checkBruteForce(socket.id)) {
            socket.emit('signal_blocked', { message: 'TOO_MANY_ATTEMPTS' });
            return;
        }

        const result = validateJoinRoom(data);
        if (!result.valid) {
            recordFailedJoin(socket.id);
            socket.emit('signal_blocked', { message: 'INVALID_INPUT' });
            return;
        }

        const { roomId, deviceId } = result.sanitized;
        const participant = ensureParticipant(socket, deviceId);

        // Check room limit based on tier
        const tier = socket.data.tier || 'free';
        const maxRooms = ROOM_LIMITS[tier] || ROOM_LIMITS.free;
        if (!participant.rooms.has(roomId) && participant.rooms.size >= maxRooms) {
            socket.emit('signal_blocked', { message: 'UPGRADE_REQUIRED', feature: 'multi_room' });
            return;
        }

        // Check if room is full (max 2)
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.size >= 2 && !currentRoom.has(socket.id)) {
            recordFailedJoin(socket.id);
            socket.emit('signal_blocked', { message: 'FREQUENCY FULL', roomId });
            return;
        }

        clearBruteForceRecord(socket.id);

        // Join Socket.IO room
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);
        participant.rooms.add(roomId);

        console.log(`[JOIN] Device ${deviceId.substring(0, 8)}... joined ${roomId}. Room: ${rooms.get(roomId).size}, Total rooms: ${participant.rooms.size}`);

        // Notify room with roomId included
        io.to(roomId).emit('link_status', {
            roomId,
            status: rooms.get(roomId).size === 2 ? 'LINKED' : 'WAITING',
            count: rooms.get(roomId).size,
        });
    });

    // --- Leave Room (Multi-Room) ---
    socket.on('leave_room', (data) => {
        const roomId = extractRoomId(data);
        if (!roomId) return;
        leaveRoom(socket, roomId);
    });

    // --- Ephemeral Text Sync (Multi-Room) ---
    socket.on('transmit_text', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;

        // Multi-room: data is { roomId, text }
        if (typeof data === 'object' && data !== null && data.roomId) {
            const roomId = extractRoomId(data);
            if (!roomId || !participant.rooms.has(roomId)) return;
            const textResult = validateText(data.text);
            if (!textResult.valid) return;
            socket.to(roomId).emit('remote_text', { roomId, text: textResult.sanitized });
        } else {
            // Legacy single-room support: data is plain string
            const textResult = validateText(data);
            if (!textResult.valid) return;
            const roomId = participant.rooms.values().next().value;
            if (roomId) {
                socket.to(roomId).emit('remote_text', { roomId, text: textResult.sanitized });
            }
        }
    });

    // --- Text Vanish (Multi-Room) ---
    socket.on('transmit_vanish', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;

        const roomId = extractRoomId(data);
        if (roomId && participant.rooms.has(roomId)) {
            socket.to(roomId).emit('remote_vanish', { roomId });
        } else {
            const firstRoom = participant.rooms.values().next().value;
            if (firstRoom) socket.to(firstRoom).emit('remote_vanish', { roomId: firstRoom });
        }
    });

    // --- PEEP & REVEAL (Multi-Room) ---
    socket.on('transmit_reveal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;

        if (typeof data === 'object' && data !== null && data.roomId) {
            const roomId = extractRoomId(data);
            if (!roomId || !participant.rooms.has(roomId)) return;
            const result = validateRevealPayload(data.payload);
            if (!result.valid) return;
            socket.to(roomId).emit('remote_reveal', { roomId, payload: result.sanitized });
        } else {
            // Legacy: data is the payload directly
            const result = validateRevealPayload(data);
            if (!result.valid) return;
            const roomId = participant.rooms.values().next().value;
            if (roomId) {
                socket.to(roomId).emit('remote_reveal', { roomId, payload: result.sanitized });
            }
        }
    });

    // --- WHISPER (Multi-Room, with optional filter) ---
    socket.on('transmit_whisper', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;

        if (typeof data === 'object' && data !== null && data.roomId) {
            const roomId = extractRoomId(data);
            if (!roomId || !participant.rooms.has(roomId)) return;
            const result = validateWhisperPayload(data.payload);
            if (!result.valid) return;
            // Validate optional filter param
            let filter = 'true';
            if (data.filter) {
                const filterResult = validateWhisperFilter(data.filter);
                if (filterResult.valid) filter = filterResult.sanitized;
            }
            socket.to(roomId).emit('remote_whisper', { roomId, payload: result.sanitized, filter });
        } else {
            const result = validateWhisperPayload(data);
            if (!result.valid) return;
            const roomId = participant.rooms.values().next().value;
            if (roomId) {
                socket.to(roomId).emit('remote_whisper', { roomId, payload: result.sanitized, filter: 'true' });
            }
        }
    });

    // --- VIDEO GLASS Controls (Multi-Room) ---
    socket.on('transmit_video_controls', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;

        if (typeof data === 'object' && data !== null && data.roomId) {
            const roomId = extractRoomId(data);
            if (!roomId || !participant.rooms.has(roomId)) return;
            const result = validateVideoControls(data.controls || data);
            if (!result.valid) return;
            socket.to(roomId).emit('remote_video_controls', { roomId, controls: result.sanitized });
        } else {
            const result = validateVideoControls(data);
            if (!result.valid) return;
            const roomId = participant.rooms.values().next().value;
            if (roomId) {
                socket.to(roomId).emit('remote_video_controls', { roomId, controls: result.sanitized });
            }
        }
    });

    // --- INVITE System ---
    socket.on('send_invite', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        const featureResult = validateInviteFeature(data.feature);
        if (!featureResult.valid) return;
        socket.to(roomId).emit('receive_invite', { roomId, feature: featureResult.sanitized });
    });

    socket.on('accept_invite', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        const featureResult = validateInviteFeature(data.feature);
        if (!featureResult.valid) return;
        socket.to(roomId).emit('invite_accepted', { roomId, feature: featureResult.sanitized });
    });

    socket.on('decline_invite', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        const featureResult = validateInviteFeature(data.feature);
        if (!featureResult.valid) return;
        socket.to(roomId).emit('invite_declined', { roomId, feature: featureResult.sanitized });
    });

    // --- LIVE GLASS Frame Streaming (legacy — kept for compat) ---
    socket.on('transmit_live_glass_frame', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.frame !== 'string' || data.frame.length > 300000) return;
        socket.to(roomId).emit('remote_live_glass_frame', { roomId, frame: data.frame });
    });

    // --- LIVE GLASS Audio Streaming (legacy — kept for compat) ---
    socket.on('transmit_live_glass_audio', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.audio !== 'string' || data.audio.length > 150000) return;
        socket.to(roomId).emit('remote_live_glass_audio', { roomId, audio: data.audio });
    });

    // --- WebRTC Ready (Live Glass handshake) ---
    socket.on('webrtc_ready', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('webrtc_ready', { roomId });
    });

    // --- WebRTC Signaling (Live Glass peer-to-peer video) ---
    socket.on('webrtc_signal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.type !== 'string') return;
        // Relay the signal to the other peer in the room
        socket.to(roomId).emit('webrtc_signal', {
            roomId,
            type: data.type,
            sdp: data.sdp,
            candidate: data.candidate,
            from: socket.id,
        });
    });

    // --- Screen Share Signaling ---
    socket.on('screen_share_signal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.type !== 'string') return;
        socket.to(roomId).emit('screen_share_signal', {
            roomId,
            type: data.type,
            sdp: data.sdp,
            candidate: data.candidate,
        });
    });

    // --- Screen Share Controls (blur relay) ---
    socket.on('transmit_screen_share_controls', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.controls !== 'object' || data.controls === null) return;
        socket.to(roomId).emit('transmit_screen_share_controls', {
            roomId,
            controls: { blur: Number(data.controls.blur) || 0 },
        });
    });

    // --- Presence Pulse ---
    socket.on('transmit_presence', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        const activity = typeof data.activity === 'number' ? Math.min(1, Math.max(0, data.activity)) : 0.5;
        const brightness = typeof data.brightness === 'number' ? Math.min(1, Math.max(0, data.brightness)) : 0.5;
        socket.to(roomId).emit('remote_presence', { roomId, activity, brightness });
    });

    // --- Presence Pulse Tap (haptic) ---
    socket.on('transmit_pulse_tap', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('remote_pulse_tap', { roomId });
    });

    // --- Disconnect Intent (leaves all rooms) ---
    socket.on('disconnect_intent', () => {
        handleFullDisconnect(socket);
    });

    socket.on('disconnect', () => {
        handleFullDisconnect(socket);
        clearBruteForceRecord(socket.id);
    });
});

// Leave a single room
function leaveRoom(socket, roomId) {
    const participant = getParticipant(socket.id);
    if (!participant || !participant.rooms.has(roomId)) return;

    socket.leave(roomId);
    participant.rooms.delete(roomId);

    const room = rooms.get(roomId);
    if (room) {
        room.delete(socket.id);
        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`[ROOM DELETED] ${roomId} is empty`);
        } else {
            io.to(roomId).emit('link_status', {
                roomId,
                status: 'SIGNAL LOST',
                count: room.size,
            });
        }
    }

    // Clean up participant if no rooms left
    if (participant.rooms.size === 0) {
        participants.delete(socket.id);
    }

    console.log(`[LEAVE] Socket left room ${roomId}`);
}

// Full disconnect - leave all rooms
function handleFullDisconnect(socket) {
    const participant = getParticipant(socket.id);
    if (!participant) return;

    // Leave each room
    for (const roomId of participant.rooms) {
        const room = rooms.get(roomId);
        if (room) {
            room.delete(socket.id);
            if (room.size === 0) {
                rooms.delete(roomId);
                console.log(`[ROOM DELETED] ${roomId} is empty`);
            } else {
                io.to(roomId).emit('link_status', {
                    roomId,
                    status: 'SIGNAL LOST',
                    count: room.size,
                });
            }
        }
    }

    participants.delete(socket.id);
    console.log(`[DISCONNECT] Socket ${socket.id} left all rooms`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[PIQABU TOWER] Listening on port ${PORT}`);
});
