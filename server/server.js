const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

// Health Check for Render
app.get('/health', (req, res) => {
    res.status(200).send('SIGNAL TOWER ACTIVE');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // allow all for MVP
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// In-memory room storage: Map<roomId, Set<socketId>>
const rooms = new Map();

// Room participants details: Map<socketId, {roomId, deviceId}>
const participants = new Map();

io.on('connection', (socket) => {
    console.log(`[CONN] Socket connected: ${socket.id}`);

    // Heartbeat - Keep-alive for Render
    socket.on('heartbeat', () => {
        socket.emit('heartbeat_ack');
    });

    // Join Room
    socket.on('join_room', ({ roomId, deviceId }) => {
        const cleanRoomId = roomId.toUpperCase();

        // Check if room is full (max 2)
        const currentRoom = rooms.get(cleanRoomId);
        if (currentRoom && currentRoom.size >= 2 && !currentRoom.has(socket.id)) {
            console.log(`[JOIN REJECTED] Room ${cleanRoomId} is full`);
            socket.emit('signal_blocked', { message: 'FREQUENCY FULL' });
            return;
        }

        // Join room
        socket.join(cleanRoomId);
        if (!rooms.has(cleanRoomId)) {
            rooms.set(cleanRoomId, new Set());
        }
        rooms.get(cleanRoomId).add(socket.id);
        participants.set(socket.id, { roomId: cleanRoomId, deviceId });

        console.log(`[JOIN] Device ${deviceId} joined ${cleanRoomId}. Count: ${rooms.get(cleanRoomId).size}`);

        // Notify room
        io.to(cleanRoomId).emit('link_status', {
            status: rooms.get(cleanRoomId).size === 2 ? 'LINKED' : 'WAITING',
            count: rooms.get(cleanRoomId).size
        });
    });

    // Ephemeral Text Sync
    socket.on('transmit_text', (data) => {
        const participant = participants.get(socket.id);
        if (participant) {
            // Send to everyone else in the room
            socket.to(participant.roomId).emit('remote_text', data);
        }
    });

    // Text Decay/Vanish
    socket.on('transmit_vanish', (data) => {
        const participant = participants.get(socket.id);
        if (participant) {
            socket.to(participant.roomId).emit('remote_vanish', data);
        }
    });

    // PEEP & REVEAL
    socket.on('transmit_reveal', (payload) => {
        const participant = participants.get(socket.id);
        if (participant) {
            console.log(`[REVEAL] ${participant.roomId}: ${payload ? 'EXPOSING' : 'COVERING'}`);
            socket.to(participant.roomId).emit('remote_reveal', payload);
        }
    });

    // WHISPER (Audio)
    socket.on('transmit_whisper', (data) => {
        const participant = participants.get(socket.id);
        if (participant) {
            socket.to(participant.roomId).emit('remote_whisper', data);
        }
    });

    // VIDEO GLASS (Controls)
    socket.on('transmit_video_controls', (data) => {
        const participant = participants.get(socket.id);
        if (participant) {
            socket.to(participant.roomId).emit('remote_video_controls', data);
        }
    });

    // Disconnect Handling
    socket.on('disconnect_intent', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });
});

function handleDisconnect(socket) {
    const participant = participants.get(socket.id);
    if (participant) {
        const { roomId } = participant;
        const room = rooms.get(roomId);
        if (room) {
            room.delete(socket.id);
            if (room.size === 0) {
                rooms.delete(roomId);
                console.log(`[ROOM DELETED] ${roomId} is empty`);
            } else {
                io.to(roomId).emit('link_status', { status: 'SIGNAL LOST', count: room.size });
            }
        }
        participants.delete(socket.id);
        console.log(`[LEAVE] Client left ${roomId}`);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[PIQABU TOWER] Listening on port ${PORT}`);
});
