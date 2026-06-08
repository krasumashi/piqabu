/**
 * Device registry — lifetime ledger of every Ghost ID we've ever seen.
 *
 * Populated automatically on socket connect (server.js handshake auth).
 * Stores only:
 *   - deviceId
 *   - firstSeen (ISO timestamp, never updated)
 *   - lastSeen  (ISO timestamp, refreshed on every connect)
 *
 * Powers Mission Control's Devices pane and the Pulse "total known
 * devices" counter. By design, contains NO content, NO IP, NO PII —
 * a Ghost ID and two timestamps. Privacy posture preserved.
 *
 * Backed by a flat JSON file under server/data/ so it survives Render
 * restarts (the /tmp disk mounted via render.yaml).
 */
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'devices.json');

function ensureDataDir() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadStore() {
    ensureDataDir();
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[DeviceRegistry] Failed to load:', e.message);
    }
    return {};
}

function saveStore(store) {
    ensureDataDir();
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DeviceRegistry] Failed to save:', e.message);
    }
}

/**
 * Touch the registry — call this every time a device connects.
 * Updates lastSeen; sets firstSeen if this is the first encounter.
 * Synchronous write so a crash mid-handshake doesn't lose the record.
 */
function touch(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return;
    const store = loadStore();
    const now = new Date().toISOString();
    if (!store[deviceId]) {
        store[deviceId] = { firstSeen: now, lastSeen: now };
    } else {
        store[deviceId].lastSeen = now;
    }
    saveStore(store);
}

/**
 * All devices the server has ever seen, sorted by lastSeen desc so
 * recently-active appear first in the dashboard.
 */
function getAll() {
    const store = loadStore();
    return Object.entries(store)
        .map(([deviceId, meta]) => ({
            deviceId,
            firstSeen: meta.firstSeen,
            lastSeen: meta.lastSeen,
        }))
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

function count() {
    return Object.keys(loadStore()).length;
}

module.exports = { touch, getAll, count };
