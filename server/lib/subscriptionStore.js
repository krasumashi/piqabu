const fs = require('fs');
const path = require('path');

/**
 * Minimal subscription persistence.
 * Maps deviceId -> { tier, stripeCustomerId, stripeSubscriptionId, expiresAt }
 *
 * For production: replace with PostgreSQL (Render provides managed Postgres)
 * or Redis. This file-based store is suitable for MVP / dev only.
 */

const STORE_PATH = path.join(__dirname, '..', 'data', 'subscriptions.json');

// Ensure data directory exists
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
        console.error('[SubscriptionStore] Failed to load:', e.message);
    }
    return {};
}

function saveStore(store) {
    ensureDataDir();
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
        console.error('[SubscriptionStore] Failed to save:', e.message);
    }
}

// 14-day grace window after proUntil before Pro hard-locks. Per the
// product call ("soft expiry"), the user is still treated as Pro inside
// the grace window; the client surfaces a "renew now" prompt during it.
// Outside the window, getTier returns 'free'.
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Get the subscription record for a deviceId
 * @param {string} deviceId
 * @returns {Object|null} record. New fields used by Paystack flow:
 *   - proUntil:           ISO timestamp the most recent purchase grants
 *                         Pro through (inclusive).
 *   - graceUntil:         derived = proUntil + 14 days. Tier stays 'pro'
 *                         until graceUntil passes.
 *   - paystackReference:  last successful transaction reference.
 *   - paystackEmail:      what we sent to Paystack (could be a derived
 *                         <ghost>@piqabu.live placeholder, see
 *                         routes/paystack.js).
 *
 * The legacy Stripe fields (stripeCustomerId, stripeSubscriptionId,
 * expiresAt) are kept untouched for any in-flight migration — they're
 * just not consulted anymore by the resolution path below.
 */
function getSubscription(deviceId) {
    const store = loadStore();
    const record = store[deviceId];
    if (!record) return null;

    // Resolution priority:
    //   1. Paystack proUntil + 14-day grace (current)
    //   2. legacy Stripe expiresAt (kept for older test records)
    const now = Date.now();
    let active = false;
    if (record.proUntil) {
        const graceUntil = new Date(record.proUntil).getTime() + GRACE_PERIOD_MS;
        active = now < graceUntil;
        record.graceUntil = new Date(graceUntil).toISOString();
        record.inGracePeriod = active && now >= new Date(record.proUntil).getTime();
    } else if (record.expiresAt) {
        active = new Date(record.expiresAt).getTime() > now;
    }

    // Persist the demoted tier only if it actually changed — avoids a
    // write storm when reads outnumber writes.
    if (!active && record.tier === 'pro') {
        record.tier = 'free';
        store[deviceId] = record;
        saveStore(store);
    }

    return record;
}

/**
 * Get the tier for a deviceId
 * @param {string} deviceId
 * @returns {'free'|'pro'}
 */
function getTier(deviceId) {
    const record = getSubscription(deviceId);
    return record?.tier || 'free';
}

/**
 * Set or update subscription for a deviceId
 * @param {string} deviceId
 * @param {object} data
 */
function setSubscription(deviceId, data) {
    const store = loadStore();
    store[deviceId] = {
        ...(store[deviceId] || {}),
        ...data,
        updatedAt: new Date().toISOString(),
    };
    saveStore(store);
}

/**
 * Find deviceId by Paystack transaction reference. The webhook receives
 * the reference and uses this to map back to whichever device kicked
 * the transaction off.
 *
 * Returns null if no match — webhook handler must short-circuit on null
 * rather than trust the reference's metadata payload alone, because
 * metadata is client-supplied at /init time and webhook-supplied at
 * delivery time; the persisted mapping is the only source-of-truth.
 */
function findByPaystackReference(reference) {
    const store = loadStore();
    for (const [deviceId, record] of Object.entries(store)) {
        if (record.paystackPendingReference === reference || record.paystackReference === reference) {
            return deviceId;
        }
    }
    return null;
}

/**
 * Find deviceId by Stripe customer ID
 * @param {string} customerId
 * @returns {string|null}
 */
function findByStripeCustomer(customerId) {
    const store = loadStore();
    for (const [deviceId, record] of Object.entries(store)) {
        if (record.stripeCustomerId === customerId) {
            return deviceId;
        }
    }
    return null;
}

/**
 * Total number of devices we've ever issued a subscription record for.
 * Used by Mission Control's Pulse pane as the "lifetime devices" metric.
 */
function countAll() {
    try {
        const store = loadStore();
        return Object.keys(store).length;
    } catch {
        return 0;
    }
}

module.exports = {
    getSubscription,
    getTier,
    setSubscription,
    findByStripeCustomer,
    findByPaystackReference,
    countAll,
    GRACE_PERIOD_MS,
};
