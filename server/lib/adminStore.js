const fs = require('fs');
const path = require('path');

// DATA_DIR points at the persistent disk on Render (mounted at /tmp via
// render.yaml). Previously this wrote to server/data/, which is
// ephemeral and wiped on every redeploy — meaning maintenance mode,
// blocked devices, and admin tier grants did NOT actually survive a
// deploy despite the comment below claiming they did. Falls back to the
// local repo dir for dev.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'admin.json');

// All admin state persists across server restart. Maintenance mode and
// the blocked-devices list survive Render redeploys — operator action
// is sticky until the operator reverses it. The client-side mirror
// (LockoutOverlay) still caches lockout state locally so cold app
// starts paint the overlay before the socket reconnects.
const DEFAULT_STATE = {
    maintenanceMode: false,
    maintenanceMessage: '',
    blockedDevices: [],
    logs: [],
    feedback: [],
    // Currently-active update notice (operator-pushed). null when no
    // notice is live. Single-active-notice model — pushing a new one
    // replaces the previous. Shape:
    //   {
    //     id: short id (so client can track dismissals per notice),
    //     mode: 'soft' | 'hard',     // banner vs full-screen wall
    //     title: string,
    //     message: string,
    //     targetVersion: string,     // optional, shown to user
    //     action: 'live' | 'apk' | 'both',
    //     apkUrl: string,            // used by 'apk' + 'both'
    //     pushedAt: ISO string,
    //   }
    updateNotice: null,
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
        existing.reason = reason || existing.reason || '';
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

function getBlockedEntry(deviceId) {
    const state = loadState();
    return state.blockedDevices.find(d => d.deviceId === deviceId) || null;
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
/**
 * Update notices — operator-pushed update prompts. Persisted (sticky
 * across server restart) like maintenance. Single-active model: pushing
 * a new notice replaces the previous one. Clearing sets to null.
 */
function setUpdateNotice(input) {
    const state = loadState();
    state.updateNotice = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        mode: input.mode === 'hard' ? 'hard' : 'soft',
        title: String(input.title || '').slice(0, 120),
        message: String(input.message || '').slice(0, 1000),
        targetVersion: String(input.targetVersion || '').slice(0, 40),
        action: ['live', 'apk', 'both'].includes(input.action) ? input.action : 'both',
        apkUrl: String(input.apkUrl || '').slice(0, 500),
        pushedAt: new Date().toISOString(),
    };
    saveState(state);
    return state.updateNotice;
}

function clearUpdateNotice() {
    const state = loadState();
    state.updateNotice = null;
    saveState(state);
}

function getUpdateNotice() {
    const state = loadState();
    return state.updateNotice || null;
}

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
    setUpdateNotice,
    clearUpdateNotice,
    getUpdateNotice,
};
