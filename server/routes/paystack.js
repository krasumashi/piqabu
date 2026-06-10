/**
 * Paystack routes — checkout init, webhook receipt, and a polling status
 * endpoint that doubles as a fallback if the webhook never arrives.
 *
 * Flow:
 *
 *   1. Client (upgrade.tsx) calls POST /api/paystack/init
 *      → server creates a Paystack transaction, persists a "pending"
 *        marker on the device's subscription record, returns the
 *        authorization_url to the client.
 *
 *   2. Client opens authorization_url in expo-web-browser. User pays.
 *      Paystack redirects to our callback_url (the upgrade screen
 *      deep-link). The web-browser session closes; client polls
 *      /api/paystack/status/:deviceId until tier=='pro'.
 *
 *   3. In parallel: Paystack POSTs an event to /api/paystack/webhook.
 *      Server verifies the HMAC, double-checks via the verify endpoint
 *      (never trust the event payload alone), flips the subscription
 *      to pro with proUntil = now + 1 year, and emits subscription_updated
 *      to the device's live socket.
 *
 * Currency: USD. The merchant's Paystack account must have USD enabled
 * (Settings → Preferences). Amount is in USD cents (PRO_PRICE_MINOR_UNITS,
 * default 2500). Easy to swap to GHS/NGN later by env override.
 *
 * Email handling: Paystack requires an email. If the client doesn't
 * supply one, we synthesize <first-12-of-ghost>@piqabu.live — Paystack
 * accepts it as a valid format, and Piqabu doesn't keep a copy of any
 * email beyond the in-flight transaction (it lives on Paystack's side
 * as the customer record, not ours).
 */

const express = require('express');
const router = express.Router();
const paystack = require('../lib/paystack');
const {
    getSubscription,
    setSubscription,
    findByPaystackReference,
} = require('../lib/subscriptionStore');
const adminStore = require('../lib/adminStore');

// Price in the lowest currency unit (pesewas for GHS, cents for USD,
// kobo for NGN). Backward-compat: if PRO_PRICE_USD_CENTS is still set
// from an older Render config it wins; otherwise we use the new
// currency-agnostic PRO_PRICE_MINOR_UNITS. Default: 30000 pesewas
// = ₵300 in Ghana cedis, matching the product decision in the session.
const PRO_PRICE_MINOR_UNITS = Number(process.env.PRO_PRICE_MINOR_UNITS)
    || Number(process.env.PRO_PRICE_USD_CENTS)
    || 30000;
const PRO_CURRENCY = process.env.PRO_CURRENCY || 'GHS';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Display formatting — kept on the server so the client doesn't have
// to know each currency's lowest-unit divisor or symbol. Major-unit
// divisor is 100 for all the currencies Paystack handles in our region.
const CURRENCY_SYMBOLS = { GHS: '₵', NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
const CURRENCY_DIVISORS = { GHS: 100, NGN: 100, USD: 100, EUR: 100, GBP: 100 };

function formatDisplayPrice(minorUnits, currency) {
    const div = CURRENCY_DIVISORS[currency] || 100;
    const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
    const major = minorUnits / div;
    // No decimals when the price is whole — ₵300 not ₵300.00 — but
    // include them when a custom env var lands on a fractional cedi.
    const formatted = Number.isInteger(major)
        ? major.toLocaleString()
        : major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sym}${formatted}`;
}

// Where Paystack sends the user's WebView after payment. The client side
// matches on this URL to close the in-app browser session. Path is
// /upgrade so we share the same deep-link verification entry as the
// keyboard paywall.
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL
    || 'https://piqabu.live/upgrade';

/** Build a placeholder email when the client didn't supply one. */
function syntheticEmail(deviceId) {
    return `${deviceId.replace(/-/g, '').slice(0, 12)}@piqabu.live`;
}

// Inject the live socket.io instance so the webhook can emit
// subscription_updated to the affected device without breaking the
// existing decoupled-router pattern.
function createPaystackRouter({ io }) {
    /**
     * GET /api/paystack/pricing
     * Single source of truth for the displayed price across all client
     * surfaces (upgrade screen, settings card, renew banner). Always
     * the same value the server uses when initializing transactions,
     * so display and charge can never drift.
     */
    router.get('/api/paystack/pricing', (req, res) => {
        res.json({
            amount: PRO_PRICE_MINOR_UNITS,
            currency: PRO_CURRENCY,
            displayPrice: formatDisplayPrice(PRO_PRICE_MINOR_UNITS, PRO_CURRENCY),
            displaySymbol: CURRENCY_SYMBOLS[PRO_CURRENCY] || PRO_CURRENCY,
            periodLabel: 'year',
        });
    });

    /**
     * POST /api/paystack/init
     * Body: { deviceId, email? }
     * Returns: { authorization_url, reference, amount, currency }
     */
    router.post('/api/paystack/init', express.json(), async (req, res) => {
        try {
            const { deviceId, email } = req.body || {};
            if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 100) {
                return res.status(400).json({ error: 'Invalid deviceId' });
            }
            const cleanEmail = (typeof email === 'string' && email.includes('@'))
                ? email.trim().slice(0, 254)
                : syntheticEmail(deviceId);

            const data = await paystack.initializeTransaction({
                email: cleanEmail,
                amount: PRO_PRICE_MINOR_UNITS,
                currency: PRO_CURRENCY,
                callbackUrl: PAYSTACK_CALLBACK_URL,
                metadata: { deviceId, product: 'piqabu_pro_yearly' },
            });

            // Persist the pending reference so the webhook (and the
            // status polling endpoint) can map back to this device even
            // if metadata gets lost. We don't grant Pro yet — that
            // happens after webhook + verify.
            setSubscription(deviceId, {
                paystackPendingReference: data.reference,
                paystackEmail: cleanEmail,
            });

            adminStore.addLog('info', 'Paystack transaction initialized', {
                deviceId,
                reference: data.reference,
                amount: PRO_PRICE_MINOR_UNITS,
                currency: PRO_CURRENCY,
            });

            res.json({
                authorization_url: data.authorization_url,
                reference: data.reference,
                amount: PRO_PRICE_MINOR_UNITS,
                currency: PRO_CURRENCY,
            });
        } catch (e) {
            console.error('[Paystack] init failed:', e.message);
            adminStore.addLog('error', 'Paystack init failed', { message: e.message });
            res.status(500).json({ error: 'Could not start payment' });
        }
    });

    /**
     * GET /api/paystack/status/:deviceId
     * Returns the device's current subscription view. The upgrade
     * screen polls this after the WebView closes, in case the webhook
     * was slow / lost. Polling does a server-side verify against
     * Paystack if a pending reference exists — that's how we recover
     * from a dropped webhook.
     */
    router.get('/api/paystack/status/:deviceId', async (req, res) => {
        const { deviceId } = req.params;
        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

        const record = getSubscription(deviceId) || {};

        // If there's a pending reference and tier is still 'free' or
        // unset, do an out-of-band verify. This is the webhook fallback.
        if (record.paystackPendingReference && record.tier !== 'pro') {
            try {
                const tx = await paystack.verifyTransaction(record.paystackPendingReference);
                if (tx.status === 'success') {
                    activatePro(deviceId, tx);
                    if (io) emitSubscriptionUpdated(io, deviceId);
                    return res.json({
                        tier: 'pro',
                        proUntil: new Date(Date.now() + ONE_YEAR_MS).toISOString(),
                    });
                }
            } catch (e) {
                console.warn('[Paystack] status verify failed:', e.message);
            }
        }

        res.json({
            tier: record.tier || 'free',
            proUntil: record.proUntil || null,
            graceUntil: record.graceUntil || null,
            inGracePeriod: !!record.inGracePeriod,
            // 'trial' | 'paystack' | 'apple_iap' | 'admin' | null
            source: record.source || null,
            isTrial: record.source === 'trial',
            // Paystack reference of the most recent SUCCESSFUL purchase.
            // Used by the client's checkout poll to distinguish "this
            // specific transaction completed" from "the device is already
            // Pro from a trial." Without it, the client falsely reports
            // success the moment it sees tier==='pro', even when the user
            // dismissed the webview without paying.
            paystackReference: record.paystackReference || null,
        });
    });

    /**
     * POST /api/paystack/webhook
     * MUST use express.raw() so the body is the exact byte sequence
     * Paystack signed — express.json() would re-serialize and break
     * the HMAC check.
     */
    router.post('/api/paystack/webhook',
        express.raw({ type: 'application/json' }),
        async (req, res) => {
            const signature = req.headers['x-paystack-signature'];
            if (!paystack.verifyWebhookSignature(req.body, signature)) {
                adminStore.addLog('warn', 'Paystack webhook: bad signature', {});
                return res.status(401).send('bad signature');
            }

            let event;
            try { event = JSON.parse(req.body.toString()); }
            catch { return res.status(400).send('bad json'); }

            // Acknowledge immediately — Paystack retries on non-2xx, but
            // we don't want to retry on transient errors mid-handler.
            // We'll handle the event asynchronously after responding.
            res.json({ received: true });

            try {
                if (event.event === 'charge.success') {
                    const reference = event.data?.reference;
                    if (!reference) return;

                    // Double-check via verify before granting anything —
                    // never trust the event payload alone.
                    const tx = await paystack.verifyTransaction(reference);
                    if (tx.status !== 'success') {
                        adminStore.addLog('warn', 'Paystack webhook: verify mismatch', {
                            reference,
                            tx_status: tx.status,
                        });
                        return;
                    }

                    const deviceId = tx.metadata?.deviceId
                        || findByPaystackReference(reference);
                    if (!deviceId) {
                        adminStore.addLog('warn', 'Paystack webhook: no deviceId mapping', { reference });
                        return;
                    }

                    activatePro(deviceId, tx);
                    if (io) emitSubscriptionUpdated(io, deviceId);
                    adminStore.addLog('info', 'Paystack: Pro activated', {
                        deviceId,
                        reference,
                        amount: tx.amount,
                        currency: tx.currency,
                    });
                }
            } catch (e) {
                console.error('[Paystack] webhook handler error:', e.message);
                adminStore.addLog('error', 'Paystack webhook handler failed', { message: e.message });
            }
        }
    );

    return router;
}

/** Grant 1 year of Pro from now. Idempotent — re-running on the same
 *  transaction reference doesn't double-extend. */
function activatePro(deviceId, tx) {
    const existing = getSubscription(deviceId) || {};
    if (existing.paystackReference === tx.reference && existing.tier === 'pro') {
        return; // already activated for this reference
    }
    const proUntil = new Date(Date.now() + ONE_YEAR_MS).toISOString();
    setSubscription(deviceId, {
        tier: 'pro',
        proUntil,
        paystackReference: tx.reference,
        paystackPendingReference: null, // clear pending marker
        paystackLastAmount: tx.amount,
        paystackLastCurrency: tx.currency,
    });
}

/** Push the live socket(s) for this device a subscription_updated. The
 *  client already listens for this event (useSocketManager) and bridges
 *  to setProAccess(true), which mirrors to the IME prefs file so the
 *  keyboard paywall drops on next activation. */
function emitSubscriptionUpdated(io, deviceId) {
    io.sockets.sockets.forEach(sock => {
        if (sock.data?.deviceId === deviceId) {
            sock.data.tier = 'pro';
            sock.emit('subscription_updated', { tier: 'pro' });
        }
    });
}

module.exports = { createPaystackRouter };
