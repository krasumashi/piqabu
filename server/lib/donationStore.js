const fs = require('fs');
const path = require('path');

/**
 * Donation persistence. Piqabu is free — donations are voluntary support
 * that grant nothing. We keep a record of each gift solely so the operator
 * can send an in-app thank-you from Mission Control.
 *
 * Each record:
 *   {
 *     reference:        Paystack transaction reference (unique key)
 *     deviceId:         donor's Ghost ID (how the thank-you is addressed)
 *     amount:           minor units (pesewas)
 *     currency:         e.g. 'GHS'
 *     email:            what we sent Paystack (may be a synthetic placeholder)
 *     at:               ISO timestamp the donation landed
 *     thanked:          true once an operator has sent a thank-you
 *     thankMessage:     the thank-you text (kept for the audit trail)
 *     thankSentAt:      ISO — when the operator sent it
 *     thankDeliveredAt: ISO — when the donor's device actually received it
 *   }
 *
 * Like the other stores, persists to DATA_DIR (Render's persistent disk)
 * so records survive redeploys.
 */

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'donations.json');

function ensureDataDir() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore() {
    ensureDataDir();
    try {
        if (fs.existsSync(STORE_PATH)) {
            return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('[DonationStore] Failed to load:', e.message);
    }
    return { donations: [] };
}

function saveStore(store) {
    ensureDataDir();
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DonationStore] Failed to save:', e.message);
    }
}

/**
 * Record a donation. Idempotent on the Paystack reference — replaying the
 * same webhook (Paystack retries) won't create duplicates.
 */
function recordDonation({ reference, deviceId, amount, currency, email }) {
    if (!reference) return null;
    const store = loadStore();
    if (!store.donations) store.donations = [];
    const existing = store.donations.find(d => d.reference === reference);
    if (existing) return existing;
    const record = {
        reference,
        deviceId: deviceId || null,
        amount: amount || 0,
        currency: currency || 'GHS',
        email: email || null,
        at: new Date().toISOString(),
        thanked: false,
        thankMessage: null,
        thankSentAt: null,
        thankDeliveredAt: null,
    };
    // Newest first.
    store.donations.unshift(record);
    // Cap the log to a sane size.
    if (store.donations.length > 1000) store.donations = store.donations.slice(0, 1000);
    saveStore(store);
    return record;
}

/** Newest-first list of donations, plus running totals (by currency). */
function listDonations() {
    const store = loadStore();
    const donations = store.donations || [];
    const totals = {};
    let count = 0;
    for (const d of donations) {
        const cur = d.currency || 'GHS';
        totals[cur] = (totals[cur] || 0) + (d.amount || 0);
        count += 1;
    }
    return { donations, totals, count };
}

/**
 * Mark a donation thanked and stamp the message. Sets thankSentAt; the
 * caller stamps delivery separately (markThankDelivered) once the donor's
 * device actually receives the operator_message.
 */
function markThanked(reference, message) {
    const store = loadStore();
    const item = (store.donations || []).find(d => d.reference === reference);
    if (!item) return null;
    item.thanked = true;
    item.thankMessage = message;
    item.thankSentAt = new Date().toISOString();
    saveStore(store);
    return item;
}

function markThankDelivered(reference) {
    const store = loadStore();
    const item = (store.donations || []).find(d => d.reference === reference);
    if (!item) return;
    if (!item.thankDeliveredAt) {
        item.thankDeliveredAt = new Date().toISOString();
        saveStore(store);
    }
}

/**
 * Thank-yous that were sent while the donor was offline and haven't been
 * delivered yet — flushed on the device's next socket connection
 * (see server.js on-connect handler).
 */
function pendingThanksFor(deviceId) {
    if (!deviceId) return [];
    const store = loadStore();
    return (store.donations || []).filter(d =>
        d.deviceId === deviceId && d.thankSentAt && !d.thankDeliveredAt);
}

module.exports = {
    recordDonation,
    listDonations,
    markThanked,
    markThankDelivered,
    pendingThanksFor,
};
