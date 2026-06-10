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
 *
 * Returns true on the FIRST encounter ever for a given deviceId, false
 * otherwise. Callers use this to gate one-time provisioning logic —
 * notably the 7-day trial grant in server.js — without needing to read
 * the store twice.
 */
function touch(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return false;
    const store = loadStore();
    const now = new Date().toISOString();
    let isFirst = false;
    if (!store[deviceId]) {
        store[deviceId] = { firstSeen: now, lastSeen: now };
        isFirst = true;
    } else {
        store[deviceId].lastSeen = now;
    }
    saveStore(store);
    return isFirst;
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

/**
 * Active-device buckets derived from lastSeen — no per-event tracking,
 * just timestamp comparisons on data we already collect at handshake
 * time. Used by Mission Control's Insights pane.
 *
 *   dau — devices seen in the last 24h
 *   wau — devices seen in the last 7d
 *   mau — devices seen in the last 30d
 */
function activeCounts() {
    const store = loadStore();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let dau = 0, wau = 0, mau = 0;
    for (const meta of Object.values(store)) {
        const last = meta?.lastSeen ? new Date(meta.lastSeen).getTime() : NaN;
        if (!isFinite(last)) continue;
        const ageMs = now - last;
        if (ageMs <= 30 * DAY) mau += 1;
        if (ageMs <= 7 * DAY) wau += 1;
        if (ageMs <= 1 * DAY) dau += 1;
    }
    return { dau, wau, mau };
}

/**
 * New-device counts bucketed by ISO date (UTC) of firstSeen. One bucket
 * per day for the chart on the Insights pane.
 *
 * Returns: { '2026-06-09': 12, '2026-06-08': 7, ... }
 */
function newDeviceBuckets({ days = 30 } = {}) {
    const store = loadStore();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const buckets = Object.create(null);
    for (const meta of Object.values(store)) {
        const ts = meta?.firstSeen ? new Date(meta.firstSeen).getTime() : NaN;
        if (!isFinite(ts) || ts < cutoff) continue;
        const day = new Date(ts).toISOString().slice(0, 10);
        buckets[day] = (buckets[day] || 0) + 1;
    }
    return buckets;
}

module.exports = { touch, getAll, count, activeCounts, newDeviceBuckets };
