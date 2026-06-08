const express = require('express');
const adminStore = require('../lib/adminStore');
const subscriptionStore = require('../lib/subscriptionStore');

function createAdminRouter({ io, rooms, participants }) {
    const router = express.Router();

    // API key auth middleware
    router.use((req, res, next) => {
        const apiKey = req.headers['x-admin-key'];
        const expected = process.env.ADMIN_API_KEY;
        if (!expected) {
            return res.status(500).json({ error: 'ADMIN_API_KEY not configured on server' });
        }
        if (apiKey !== expected) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });

    // GET /admin/status — server overview
    router.get('/status', (req, res) => {
        const state = adminStore.getState();
        const connectedSockets = io.sockets.sockets.size;
        const activeRooms = rooms.size;
        const totalParticipants = participants.size;
        // Total devices the subscriptionStore has ever seen (lifetime
        // Ghost IDs). Used by Mission Control's Pulse pane.
        let totalDevices = 0;
        try { totalDevices = subscriptionStore.countAll?.() ?? 0; } catch { /* noop */ }

        res.json({
            uptime: process.uptime(),
            serverTime: Date.now(),
            connectedSockets,
            activeRooms,
            totalParticipants,
            totalDevices,
            maintenanceMode: state.maintenanceMode,
            maintenanceMessage: state.maintenanceMessage,
            blockedDevices: state.blockedDevices.length,
        });
    });

    // GET /admin/rooms — list active rooms
    router.get('/rooms', (req, res) => {
        const roomList = [];
        rooms.forEach((sockets, roomId) => {
            const participantDetails = [];
            sockets.forEach(socketId => {
                const p = participants.get(socketId);
                if (p) {
                    participantDetails.push({
                        socketId: socketId.substring(0, 8) + '...',
                        deviceId: p.deviceId ? p.deviceId.substring(0, 8) + '...' : 'unknown',
                        roomCount: p.rooms.size,
                    });
                }
            });
            roomList.push({
                roomId,
                participants: sockets.size,
                details: participantDetails,
            });
        });
        res.json({ rooms: roomList });
    });

    // POST /admin/maintenance — toggle maintenance mode
    router.post('/maintenance', express.json(), (req, res) => {
        const { enabled, message } = req.body || {};
        const state = adminStore.setMaintenance(enabled, message);

        // Notify all connected clients
        if (enabled) {
            io.emit('maintenance_mode', {
                enabled: true,
                message: message || 'System is under maintenance. Please try again later.',
            });
        } else {
            io.emit('maintenance_mode', { enabled: false, message: '' });
        }

        res.json({ success: true, maintenanceMode: state.maintenanceMode, maintenanceMessage: state.maintenanceMessage });
    });

    // GET /admin/devices — list blocked devices
    router.get('/devices', (req, res) => {
        const state = adminStore.getState();
        res.json({ blockedDevices: state.blockedDevices });
    });

    // POST /admin/devices/:deviceId/block
    router.post('/devices/:deviceId/block', express.json(), (req, res) => {
        const { deviceId } = req.params;
        const { reason } = req.body || {};
        adminStore.blockDevice(deviceId, reason);
        res.json({ success: true, message: `Device ${deviceId.substring(0, 8)}... blocked` });
    });

    // POST /admin/devices/:deviceId/unblock
    router.post('/devices/:deviceId/unblock', (req, res) => {
        const { deviceId } = req.params;
        adminStore.unblockDevice(deviceId);
        res.json({ success: true, message: `Device ${deviceId.substring(0, 8)}... unblocked` });
    });

    // POST /admin/devices/:deviceId/kick — force disconnect
    router.post('/devices/:deviceId/kick', (req, res) => {
        const { deviceId } = req.params;
        let kicked = 0;

        participants.forEach((participant, socketId) => {
            if (participant.deviceId === deviceId) {
                const sock = io.sockets.sockets.get(socketId);
                if (sock) {
                    sock.emit('force_disconnect', { message: 'You have been disconnected by an administrator.' });
                    sock.disconnect(true);
                    kicked++;
                }
            }
        });

        res.json({ success: true, message: `Kicked ${kicked} connection(s) for device ${deviceId.substring(0, 8)}...` });
    });

    // POST /admin/broadcast — send message to all clients
    router.post('/broadcast', express.json(), (req, res) => {
        const { message } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'message is required' });
        }
        io.emit('admin_broadcast', { message, timestamp: new Date().toISOString() });
        res.json({ success: true, message: `Broadcast sent to ${io.sockets.sockets.size} clients` });
    });

    // GET /admin/logs — view system logs and feedback
    router.get('/logs', (req, res) => {
        const state = adminStore.getState();
        res.json({ logs: state.logs || [], feedback: state.feedback || [] });
    });

    // POST /admin/rooms/:roomId/close — force close a room
    router.post('/rooms/:roomId/close', (req, res) => {
        const { roomId } = req.params;
        const socketsInRoom = rooms.get(roomId);
        let closedCount = 0;
        if (socketsInRoom) {
            socketsInRoom.forEach(socketId => {
                const sock = io.sockets.sockets.get(socketId);
                if (sock) {
                    sock.emit('force_disconnect', { message: 'This room has been closed by an administrator.' });
                    sock.disconnect(true);
                    closedCount++;
                }
            });
            rooms.delete(roomId);
            adminStore.addLog('warn', `Room force-closed by admin`, { roomId });
        }
        res.json({ success: true, message: `Room ${roomId.substring(0, 8)} closed (${closedCount} kicked)` });
    });

    // POST /admin/feedback/:id/resolve — resolve/unresolve feedback
    router.post('/feedback/:id/resolve', express.json(), (req, res) => {
        const { id } = req.params;
        const { resolved } = req.body || {};
        adminStore.resolveFeedback(id, resolved);
        res.json({ success: true });
    });

    // DELETE /admin/feedback/:id — hide/delete feedback
    router.delete('/feedback/:id', (req, res) => {
        const { id } = req.params;
        adminStore.deleteFeedback(id);
        res.json({ success: true });
    });

    // GET /admin/active-devices — list all connected sockets
    router.get('/active-devices', (req, res) => {
        const deviceList = [];
        let proCount = 0;
        let freeCount = 0;
        io.sockets.sockets.forEach((socket, socketId) => {
            const data = socket.data || {};
            const p = participants.get(socketId);
            const tier = data.tier || 'free';
            if (tier === 'pro') proCount += 1; else freeCount += 1;
            deviceList.push({
                socketId: socketId.substring(0, 8),
                deviceId: data.deviceId ? data.deviceId.substring(0, 12) + '...' : 'unknown',
                fullDeviceId: data.deviceId || 'unknown',
                tier,
                ip: socket.handshake.address || 'unknown',
                roomsJoined: p ? p.rooms.size : 0,
            });
        });
        res.json({ devices: deviceList, proCount, freeCount });
    });

    // POST /admin/devices/:deviceId/tier — manually set pro/free status
    router.post('/devices/:deviceId/tier', express.json(), (req, res) => {
        const { deviceId } = req.params;
        const { tier } = req.body || {};
        if (tier !== 'free' && tier !== 'pro') return res.status(400).json({ error: 'invalid tier' });
        
        subscriptionStore.setSubscription(deviceId, { tier });
        
        participants.forEach((p, socketId) => {
            if (p.deviceId === deviceId) {
                const sock = io.sockets.sockets.get(socketId);
                if (sock) {
                    sock.data.tier = tier;
                    sock.emit('subscription_updated', { tier });
                }
            }
        });
        adminStore.addLog('info', `Admin forcibly changed tier to ${tier}`, { deviceId });
        res.json({ success: true, tier });
    });

    return router;
}

module.exports = { createAdminRouter };
