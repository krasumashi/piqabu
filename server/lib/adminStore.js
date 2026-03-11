const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'admin.json');

const DEFAULT_STATE = {
    maintenanceMode: false,
    maintenanceMessage: '',
    blockedDevices: [],
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

module.exports = {
    getState,
    setMaintenance,
    blockDevice,
    unblockDevice,
    isBlocked,
};
