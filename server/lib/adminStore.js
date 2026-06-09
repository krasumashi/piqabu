const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'admin.json');

// Only logs + feedback persist across server restart. Maintenance mode
// and the blocked-devices list are deliberately TRANSIENT — both clear
// on every server boot. Product call: operator-driven access controls
// shouldn't outlive a deploy or a Render-induced restart. If maintenance
// or a block needs to come back, the operator re-applies it.
const DEFAULT_STATE = {
    logs: [],
    feedback: [],
};

// Transient (memory-only) admin state. NOT persisted, NOT in loadState().
// Reset to defaults at every process start.
const transient = {
    maintenanceMode: false,
    maintenanceMessage: '',
    // Map<deviceId, { reason, blockedAt }>
    blockedDevices: new Map(),
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
            const parsed = JSON.parse(raw);
            // Strip any legacy maintenance/block fields that older versions
            // of this file persisted. They are transient now.
            const { maintenanceMode, maintenanceMessage, blockedDevices, ...rest } = parsed;
            void maintenanceMode; void maintenanceMessage; void blockedDevices;
            return { ...DEFAULT_STATE, ...rest };
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
    // Compose persisted state with the transient maintenance + block
    // surface so all existing readers (Mission Control /admin/status,
    // /admin/devices, etc) keep working without each one having to
    // learn about two storage tiers.
    const persisted = loadState();
    return {
        ...persisted,
        maintenanceMode: transient.maintenanceMode,
        maintenanceMessage: transient.maintenanceMessage,
        blockedDevices: Array.from(transient.blockedDevices.values()),
    };
}

function setMaintenance(enabled, message) {
    transient.maintenanceMode = !!enabled;
    transient.maintenanceMessage = message || '';
    return getState();
}

function blockDevice(deviceId, reason) {
    const existing = transient.blockedDevices.get(deviceId);
    transient.blockedDevices.set(deviceId, {
        deviceId,
        reason: reason || (existing?.reason ?? ''),
        blockedAt: existing?.blockedAt || new Date().toISOString(),
    });
    return getState();
}

function unblockDevice(deviceId) {
    transient.blockedDevices.delete(deviceId);
    return getState();
}

function isBlocked(deviceId) {
    return transient.blockedDevices.has(deviceId);
}

function getBlockedEntry(deviceId) {
    return transient.blockedDevices.get(deviceId) || null;
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

/**
 * All replies for a given deviceId that haven't been *read* yet.
 *
 * Persistence rule (per product call): the reply stays pending and
 * re-delivers on every reconnect until the user explicitly dismisses
 * the banner (which acks back with operator_message_dismissed and
 * marks readAt). This is robust against the common failure modes of
 * a flaky network — app open → quick close, network blip mid-emit,
 * banner shown but never tapped — all of which would otherwise lose
 * the reply.
 *
 * deliveredAt is kept as a diagnostic stamp ("first time the server
 * emitted this") but isn't a gate on re-delivery.
 */
function pendingRepliesFor(deviceId) {
    const state = loadState();
    if (!state.feedback) return [];
    return state.feedback.filter(f =>
        f.deviceId === deviceId
        && f.reply
        && f.reply.sentAt
        && !f.reply.readAt
    );
}

module.exports = {
    getState,
    setMaintenance,
    blockDevice,
    unblockDevice,
    isBlocked,
    getBlockedEntry,
    addLog,
    addFeedback,
    resolveFeedback,
    deleteFeedback,
    replyToFeedback,
    markReplyDelivered,
    markReplyRead,
    pendingRepliesFor,
};
