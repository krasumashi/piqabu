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

/**
 * Get the subscription record for a deviceId
 * @param {string} deviceId
 * @returns {{ tier: 'free'|'pro', stripeCustomerId?: string, stripeSubscriptionId?: string, expiresAt?: string } | null}
 */
function getSubscription(deviceId) {
    const store = loadStore();
    const record = store[deviceId];
    if (!record) return null;

    // Check expiration
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
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

module.exports = {
    getSubscription,
    getTier,
    setSubscription,
    findByStripeCustomer,
};
