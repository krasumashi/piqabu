const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'admin.json');

const DEFAULT_STATE = {
    maintenanceMode: false,
    maintenanceMessage: '',
    blockedDevices: [],
    logs: [],
    feedback: [],
};

function ensureDataDir() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadState() {
    ensureDataDir();
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf-8');
            return { ...DEFAULT_STATE, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.error('[AdminStore] Failed to load:', e.message);
    }
    return { ...DEFAULT_STATE };
}

function saveState(state) {
    ensureDataDir();
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
        console.error('[AdminStore] Failed to save:', e.message);
    }
}

function getState() {
    return loadState();
}

function setMaintenance(enabled, message) {
    const state = loadState();
    state.maintenanceMode = !!enabled;
    state.maintenanceMessage = message || '';
    saveState(state);
    return state;
}

function blockDevice(deviceId, reason) {
    const state = loadState();
    const existing = state.blockedDevices.find(d => d.deviceId === deviceId);
    if (existing) {
        existing.reason = reason || '';
        existing.blockedAt = new Date().toISOString();
    } else {
        state.blockedDevices.push({
            deviceId,
            reason: reason || '',
            blockedAt: new Date().toISOString(),
        });
    }
    saveState(state);
    return state;
}

function unblockDevice(deviceId) {
    const state = loadState();
    state.blockedDevices = state.blockedDevices.filter(d => d.deviceId !== deviceId);
    saveState(state);
    return state;
}

function isBlocked(deviceId) {
    const state = loadState();
    return state.blockedDevices.some(d => d.deviceId === deviceId);
}

// --- Mission Control Logs & Feedback ---

function addLog(type, message, meta = {}) {
    const state = loadState();
    if (!state.logs) state.logs = [];
    state.logs.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        type, // 'info', 'warn', 'error'
        message,
        meta,
        timestamp: new Date().toISOString(),
    });
    // Keep only the last 500 logs
    if (state.logs.length > 500) state.logs = state.logs.slice(0, 500);
    saveState(state);
}

function addFeedback(deviceId, message) {
    const state = loadState();
    if (!state.feedback) state.feedback = [];
    state.feedback.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        deviceId,
        message,
        resolved: false,
        timestamp: new Date().toISOString(),
    });
    // Keep only the last 200 feedback submissions
    if (state.feedback.length > 200) state.feedback = state.feedback.slice(0, 200);
    saveState(state);
}

function resolveFeedback(id, resolved = true) {
    const state = loadState();
    if (!state.feedback) return state;
    const item = state.feedback.find(f => f.id === id);
    if (item) {
        item.resolved = !!resolved;
        saveState(state);
    }
    return state;
}

function deleteFeedback(id) {
    const state = loadState();
    if (!state.feedback) return state;
    state.feedback = state.feedback.filter(f => f.id !== id);
    saveState(state);
    return state;
}

/**
 * Operator reply to a feedback item. The reply lives on the feedback
 * record itself so the helpdesk thread stays threaded. Delivery state
 * machine:
 *   sentAt       — when the operator hit Send
 *   deliveredAt  — set the moment we emit it to a live socket
 *   readAt       — set when the device acks dismissal
 * If a reply has sentAt but no deliveredAt, the server should emit it
 * on the recipient's next reconnect (see deliverPendingReplies).
 */
function replyToFeedback(id, message) {
    const state = loadState();
    if (!state.feedback) return null;
    const item = state.feedback.find(f => f.id === id);
    if (!item) return null;
    item.reply = {
        message: String(message ?? '').slice(0, 4000),
        sentAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
    };
    item.resolved = true;
    saveState(state);
    return item;
}

function markReplyDelivered(id) {
    const state = loadState();
    if (!state.feedback) return;
    const item = state.feedback.find(f => f.id === id);
    if (!item || !item.reply) return;
    if (!item.reply.deliveredAt) {
        item.reply.deliveredAt = new Date().toISOString();
        saveState(state);
    }
}

function markReplyRead(id) {
    const state = loadState();
    if (!state.feedback) return;
    const item = state.feedback.find(f => f.id === id);
    if (!item || !item.reply) return;
    if (!item.reply.readAt) {
        item.reply.readAt = new Date().toISOString();
        saveState(state);
    }
}

/** All replies for a given deviceId that haven't been delivered yet. */
function pendingRepliesFor(deviceId) {
    const state = loadState();
    if (!state.feedback) return [];
    return state.feedback.filter(f =>
        f.deviceId === deviceId
        && f.reply
        && f.reply.sentAt
        && !f.reply.deliveredAt
    );
}

module.exports = {
    getState,
    setMaintenance,
    blockDevice,
    unblockDevice,
    isBlocked,
    addLog,
    addFeedback,
    resolveFeedback,
    deleteFeedback,
    replyToFeedback,
    markReplyDelivered,
    markReplyRead,
    pendingRepliesFor,
};
