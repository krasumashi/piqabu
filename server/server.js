const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const multer = require('multer');
const fs = require('fs');
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
const deviceRegistry = require('./lib/deviceRegistry');
const adminStore = require('./lib/adminStore');
const stripeRoutes = require('./routes/stripe');
const { createAdminRouter } = require('./routes/admin');
const path = require('path');

const app = express();

// --- Security Middleware ---
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
}));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:19006,http://localhost:19000,https://piqabu.onrender.com').split(',');

app.use(cors({ origin: '*' }));

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

// --- Mission Control Feedback (Mobile Client -> Server) ---
app.post('/api/feedback', express.json(), healthLimiter, (req, res) => {
    const { deviceId, message } = req.body || {};
    if (!deviceId || !message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing deviceId or message' });
    }
    // Sanitize the deviceId the same way the Socket.IO middleware does
    // (validateDeviceId trims + UUID-validates). Without this, a feedback
    // record stored with stray whitespace would never match the socket's
    // sanitized deviceId during the reply-delivery lookup, and replies
    // would silently never reach the user.
    const validated = validateDeviceId(deviceId);
    if (!validated.valid) {
        return res.status(400).json({ error: validated.error || 'Invalid deviceId' });
    }
    const cleanDeviceId = validated.sanitized;
    const cleanMessage = message.substring(0, 1000);
    adminStore.addFeedback(cleanDeviceId, cleanMessage);
    adminStore.addLog('info', 'New user feedback received', { deviceId: cleanDeviceId });
    res.json({ success: true });
});

// --- File Upload (Multer) ---
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '';
        cb(null, uniqueSuffix + ext);
    },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max

// Serve uploaded files with permissive CORS headers so mobile app can download
app.use('/uploads', (req, res, next) => {
    // Override helmet's restrictive CORP/COEP headers for file downloads
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    // Set cache to short-lived (files are ephemeral)
    res.setHeader('Cache-Control', 'public, max-age=300');
    next();
}, express.static(uploadDir, {
    // Ensure correct MIME types for all file types
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.zip': 'application/zip',
            '.json': 'application/json',
            '.xml': 'application/xml',
        };
        if (mimeMap[ext]) {
            res.setHeader('Content-Type', mimeMap[ext]);
        }
    },
}));

// Upload endpoint
const uploadLimiter = rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false });
app.post('/upload', uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    const roomId = req.body.roomId;
    if (roomId && typeof roomId === 'string') {
        if (!roomFiles.has(roomId)) roomFiles.set(roomId, new Set());
        roomFiles.get(roomId).add(req.file.path);
    }
    res.json({ url: `/uploads/${req.file.filename}` });
});

// Track uploaded files per room for cleanup
const roomFiles = new Map();

// --- ICE Servers (TURN credentials) ---
app.get('/ice-servers', (req, res) => {
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        const user = process.env.TURN_USERNAME;
        const cred = process.env.TURN_CREDENTIAL;
        // Add all Metered TURN relay variants for maximum connectivity
        iceServers.push(
            { urls: 'stun:stun.relay.metered.ca:80', username: user, credential: cred },
            { urls: 'turn:global.relay.metered.ca:80', username: user, credential: cred },
            { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: user, credential: cred },
            { urls: 'turn:global.relay.metered.ca:443', username: user, credential: cred },
            { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: user, credential: cred },
            { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: user, credential: cred },
        );
    }
    res.json({ iceServers });
});

// Stripe subscription routes (checkout, status, webhook)
app.use(stripeRoutes);

// Serve static files (legacy admin dashboard at /admin/index.html)
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────
//  Mission Control SPA — Phase 1 dashboard built from ../mission-control.
//  Served at /mission/* and as the root content of admin.piqabu.live.
//  The /admin/* API router below remains the single source of truth for
//  data; this only serves the React static bundle.
// ─────────────────────────────────────────────────────────────────────────
const missionControlDist = path.join(__dirname, '..', 'mission-control', 'dist');
const missionControlIndex = path.join(missionControlDist, 'index.html');

// (1) If hostname is admin.piqabu.live, rewrite "/" to "/mission/" so
//     visitors land on the dashboard without typing the path. We use a
//     rewrite (mutate req.url) rather than a redirect so the browser bar
//     stays clean and there's no extra round-trip.
app.use((req, res, next) => {
    const host = (req.hostname || '').toLowerCase();
    if (host === 'admin.piqabu.live' && (req.url === '/' || req.url === '')) {
        req.url = '/mission/';
    }
    next();
});

// (2) Static assets from the build output.
app.use('/mission', express.static(missionControlDist, {
    maxAge: '1h',
    index: false, // we handle index.html ourselves so the SPA fallback works
}));

// (3) SPA fallback: any GET under /mission/* that didn't match a real
//     file returns the SPA's index.html so client-side routing works on
//     refresh and deep links.
app.get(/^\/mission(?:\/.*)?$/, (req, res, next) => {
    res.sendFile(missionControlIndex, (err) => {
        if (err) {
            // Build hasn't run yet (e.g. local dev without `npm run build:mission`)
            // — fall through to the next handler so we don't 500 the user.
            next();
        }
    });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 15e6, // 15MB to handle larger file attachments
    pingTimeout: 60000,
    pingInterval: 25000,
});

// In-memory room storage: Map<roomId, Set<socketId>>
const rooms = new Map();

// Multi-room participants: Map<socketId, { rooms: Set<roomId>, deviceId: string }>
const participants = new Map();

// Time-fenced minted codes: Map<code, createdAt>. When `request_room` mints
// a code, we record the timestamp here. If the same code is later used in
// `join_room` AFTER TIME_FENCE_MS has elapsed AND no room has been opened
// against it yet, the join is rejected (TIME_FENCED). This kills stale
// share-links sitting in WhatsApp history a week after they were sent.
//
// Once a room is opened against a code, the fence entry is dropped — an
// active session is its own proof of liveness.
const mintedCodes = new Map();
const TIME_FENCE_MS = 30 * 60 * 1000; // 30 minutes

// Periodic sweep so the map doesn't grow unboundedly with abandoned mints.
setInterval(() => {
    const now = Date.now();
    for (const [code, mintedAt] of mintedCodes) {
        if (now - mintedAt > TIME_FENCE_MS * 2) {
            mintedCodes.delete(code);
        }
    }
}, 5 * 60 * 1000);

// Mount admin routes
app.use('/admin', createAdminRouter({ io, rooms, participants }));

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
        // Record the device in the lifetime registry — sets firstSeen
        // on first encounter, refreshes lastSeen on every reconnect.
        // Best-effort; failures here mustn't break the handshake.
        try { deviceRegistry.touch(result.sanitized); } catch { /* noop */ }
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

    // --- Operator messages (Mission Control replies) ---
    // On connect, deliver any pending operator replies queued for this
    // device while it was offline.
    try {
        const deviceId = socket.data?.deviceId;
        if (deviceId) {
            const pending = adminStore.pendingRepliesFor(deviceId);
            for (const item of pending) {
                socket.emit('operator_message', {
                    id: item.id,
                    message: item.reply.message,
                    sentAt: item.reply.sentAt,
                    inReplyTo: item.message,
                });
                adminStore.markReplyDelivered(item.id);
            }
        }
    } catch (e) {
        console.warn('[OperatorMessages] pending delivery failed:', e?.message);
    }

    // Client acks dismissal — server marks the reply as read so it
    // stops re-delivering on future reconnects.
    socket.on('operator_message_dismissed', (data) => {
        const id = data?.id;
        if (typeof id !== 'string') return;
        adminStore.markReplyRead(id);
    });

    // --- Server-Side Room Code Generation ---
    socket.on('request_room', (callback) => {
        if (typeof callback !== 'function') return;

        let code;
        let attempts = 0;
        do {
            code = generateSecureRoomCode();
            attempts++;
        } while ((rooms.has(code) || mintedCodes.has(code)) && attempts < 100);

        if (attempts >= 100) {
            callback({ error: 'UNABLE_TO_GENERATE_CODE' });
            return;
        }

        // Stamp the mint time so we can enforce the time-fence on stale
        // share-links. Once anyone actually joins the room (see join_room),
        // we drop the stamp — an active session can't be too old.
        mintedCodes.set(code, Date.now());

        callback({ roomCode: code, mintedAt: Date.now(), expiresInMs: TIME_FENCE_MS });
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

        // Check maintenance mode
        const adminState = adminStore.getState();
        if (adminState.maintenanceMode) {
            socket.emit('signal_blocked', {
                message: 'MAINTENANCE',
                detail: adminState.maintenanceMessage || 'System is under maintenance.',
            });
            return;
        }

        // Check if device is blocked
        if (adminStore.isBlocked(deviceId)) {
            socket.emit('signal_blocked', { message: 'DEVICE_BLOCKED' });
            return;
        }

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

        // Time-fence check: if this code was minted via request_room more
        // than TIME_FENCE_MS ago AND nobody has opened a room on it yet,
        // reject. Only applies to minted-then-stale codes — manually typed
        // codes that don't appear in mintedCodes flow straight through.
        const mintedAt = mintedCodes.get(roomId);
        if (mintedAt) {
            const age = Date.now() - mintedAt;
            const roomIsLive = currentRoom && currentRoom.size > 0;
            if (age > TIME_FENCE_MS && !roomIsLive) {
                recordFailedJoin(socket.id);
                socket.emit('signal_blocked', { message: 'TIME_FENCED', roomId, ageMs: age });
                mintedCodes.delete(roomId);
                return;
            }
        }

        clearBruteForceRecord(socket.id);

        // Join Socket.IO room
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);
        participant.rooms.add(roomId);

        // Active session — fence no longer applies.
        mintedCodes.delete(roomId);

        console.log(`[JOIN] Device ${deviceId.substring(0, 8)}... joined ${roomId}. Room: ${rooms.get(roomId).size}, Total rooms: ${participant.rooms.size}`);

        // Notify room with roomId included
        const roomSize = rooms.get(roomId).size;
        io.to(roomId).emit('link_status', {
            roomId,
            status: roomSize === 2 ? 'LINKED' : 'WAITING',
            count: roomSize,
        });

        // When the room reaches 2 participants, hand each side the other's
        // Ghost ID so they can compute the mutual fingerprint locally.
        // Both screens should derive the same value — if they don't, the
        // server is misbehaving and the channel is compromised.
        if (roomSize === 2) {
            const socketIds = Array.from(rooms.get(roomId));
            const [a, b] = socketIds;
            const aP = getParticipant(a);
            const bP = getParticipant(b);
            if (aP && bP) {
                io.to(a).emit('partner_handshake', {
                    roomId,
                    partnerDeviceId: bP.deviceId,
                });
                io.to(b).emit('partner_handshake', {
                    roomId,
                    partnerDeviceId: aP.deviceId,
                });
            }
        }
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

    // --- Video Playback Controls (play/pause/seek) ---
    socket.on('transmit_video_playback', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.control !== 'object' || data.control === null) return;
        socket.to(roomId).emit('remote_video_playback', {
            roomId,
            control: {
                action: String(data.control.action || '').substring(0, 10),
                position: typeof data.control.position === 'number' ? data.control.position : undefined,
            },
        });
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
        socket.to(roomId).emit('webrtc_ready', { roomId, from: socket.id });
    });

    // --- WebRTC Signaling (Live Glass peer-to-peer video) ---
    socket.on('webrtc_signal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        // Client sends { roomId, signal: { type, payload } }
        if (!data.signal || typeof data.signal.type !== 'string') return;
        // Relay as-is so the receiving client gets the same structure
        socket.to(roomId).emit('webrtc_signal', {
            roomId,
            signal: data.signal,
            from: socket.id,
        });
    });

    // --- Whisper WebRTC Signaling (walkie-talkie audio) ---
    socket.on('whisper_signal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (!data.signal || typeof data.signal.type !== 'string') return;
        socket.to(roomId).emit('whisper_signal', {
            roomId,
            signal: data.signal,
            from: socket.id,
        });
    });

    socket.on('whisper_ready', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('whisper_ready', { roomId, from: socket.id });
    });

    socket.on('whisper_ptt', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        const speaking = data.speaking === true;
        socket.to(roomId).emit('whisper_ptt', { roomId, speaking });
    });

    // --- Screenshot Detection ---
    socket.on('screenshot_taken', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('screenshot_alert', { roomId });
    });

    // --- Screen Share Ready (mirror of webrtc_ready for the screen channel) ---
    socket.on('screen_share_ready', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('screen_share_ready', { roomId, from: socket.id });
    });

    // --- Screen Share Ended (sharer notifies viewer the session has ended) ---
    // Relayed so the viewer can close its panel cleanly with a "PARTNER STOPPED
    // SHARING" notice, instead of being left staring at the last frame.
    socket.on('screen_share_ended', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        socket.to(roomId).emit('screen_share_ended', { roomId, from: socket.id });
    });

    // --- Screen Share Signaling ---
    // Two payload shapes supported:
    //   New (LiveGlass-style): { roomId, signal: { type, payload } }
    //     -> relayed as { roomId, signal, from } so the receiver can use
    //        `from` for deterministic caller selection.
    //   Legacy (flat): { roomId, type, sdp, candidate }
    //     -> relayed as-is for backward compatibility with older builds.
    socket.on('screen_share_signal', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;

        if (data.signal && typeof data.signal.type === 'string') {
            // New shape — pass through with from
            socket.to(roomId).emit('screen_share_signal', {
                roomId,
                signal: data.signal,
                from: socket.id,
            });
            return;
        }

        if (typeof data.type === 'string') {
            // Legacy shape — keep the old relay so older APKs don't break
            socket.to(roomId).emit('screen_share_signal', {
                roomId,
                type: data.type,
                sdp: data.sdp,
                candidate: data.candidate,
                from: socket.id,
            });
        }
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
            controls: {
                blur: Number(data.controls.blur) || 0,
                isBnW: data.controls.isBnW !== undefined ? !!data.controls.isBnW : true,
            },
        });
    });

    // --- Live Glass Controls (blur relay) ---
    socket.on('transmit_live_glass_controls', (data) => {
        const participant = getParticipant(socket.id);
        if (!participant) return;
        const roomId = extractRoomId(data);
        if (!roomId || !participant.rooms.has(roomId)) return;
        if (typeof data.controls !== 'object' || data.controls === null) return;
        socket.to(roomId).emit('remote_live_glass_controls', {
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

// Clean up uploaded files for a room
function cleanupRoomFiles(roomId) {
    const files = roomFiles.get(roomId);
    if (!files) return;
    for (const filePath of files) {
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') console.warn(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
        });
    }
    roomFiles.delete(roomId);
    console.log(`[CLEANUP] Deleted ${files.size} files for room ${roomId}`);
}

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
            cleanupRoomFiles(roomId);
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
                cleanupRoomFiles(roomId);
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
