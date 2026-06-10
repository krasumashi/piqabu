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
 * Aggregations used by Mission Control's Insights pane. All compute
 * over the persisted store; nothing is collected specifically for
 * analytics. If it can't be derived from data the operator already
 * legitimately sees, it doesn't appear here.
 */
/**
 * 7-day free trial — granted automatically the FIRST time we see a
 * Ghost ID. Idempotent: re-calling with the same deviceId after the
 * trial has been granted does nothing. After the trial expires the
 * device drops back to free naturally via the proUntil resolution
 * in getSubscription().
 *
 * If the device has ever had `source` set (i.e. they've subscribed
 * via Paystack / Apple IAP / admin override) we do not grant a trial —
 * that would be a regression. If they're churning post-trial and
 * want another shot, they convert through the normal paywall.
 *
 * Returns true if a trial was granted in this call, false otherwise.
 */
const TRIAL_DAYS = 7;

function startTrialIfEligible(deviceId) {
    if (!deviceId) return false;
    const store = loadStore();
    const existing = store[deviceId];
    // Already had ANY proUntil set? Don't reset — that includes a
    // trial we previously granted, plus all real subscriptions.
    if (existing && existing.proUntil) return false;
    if (existing && existing.source && existing.source !== 'trial') return false;
    const proUntil = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    store[deviceId] = {
        ...(existing || {}),
        tier: 'pro',
        proUntil,
        source: 'trial',
        trialGrantedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    saveStore(store);
    return true;
}

function aggregateProStats() {
    const store = loadStore();
    const now = Date.now();
    let active = 0;       // tier='pro' AND now < proUntil
    let inGrace = 0;      // tier='pro' AND proUntil <= now < proUntil + grace
    let churned30d = 0;   // graceUntil passed within the last 30 days

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    for (const record of Object.values(store)) {
        if (!record) continue;
        if (record.proUntil) {
            const proUntilMs = new Date(record.proUntil).getTime();
            const graceUntilMs = proUntilMs + GRACE_PERIOD_MS;
            if (now < proUntilMs) {
                active += 1;
            } else if (now < graceUntilMs) {
                inGrace += 1;
            } else if (now - graceUntilMs < THIRTY_DAYS_MS) {
                churned30d += 1;
            }
        }
    }

    return { active, inGrace, churned30d };
}

/**
 * Sum of every successful Paystack transaction we recorded. Returns
 * cents grouped by currency. Mission Control collapses these into a
 * display string. Zero-history accounts return an empty object.
 */
function revenueByCurrency() {
    const store = loadStore();
    const totals = Object.create(null);
    for (const record of Object.values(store)) {
        const amt = Number(record?.paystackLastAmount);
        const cur = record?.paystackLastCurrency;
        if (!amt || !cur) continue;
        if (!totals[cur]) totals[cur] = 0;
        totals[cur] += amt;
    }
    return totals;
}

/**
 * Revenue bucketed by ISO date (UTC). One bucket per day the device's
 * updatedAt landed on, summed in the device's transaction currency.
 * Used by the 30-day chart in Insights.
 *
 * Returns: { '2026-06-09': { USD: 2500, NGN: 40000 }, ... }
 */
function revenueByDay({ days = 30 } = {}) {
    const store = loadStore();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const buckets = Object.create(null);
    for (const record of Object.values(store)) {
        if (!record?.paystackLastAmount || !record?.paystackLastCurrency) continue;
        const ts = record.updatedAt ? new Date(record.updatedAt).getTime() : NaN;
        if (!isFinite(ts) || ts < cutoff) continue;
        const day = new Date(ts).toISOString().slice(0, 10);
        if (!buckets[day]) buckets[day] = Object.create(null);
        const cur = record.paystackLastCurrency;
        buckets[day][cur] = (buckets[day][cur] || 0) + record.paystackLastAmount;
    }
    return buckets;
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
    aggregateProStats,
    revenueByCurrency,
    revenueByDay,
    startTrialIfEligible,
    TRIAL_DAYS,
    GRACE_PERIOD_MS,
};
