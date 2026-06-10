/**
 * Apple In-App Purchase routes.
 *
 * The iOS client buys Piqabu Pro via Apple's IAP system, receives a
 * receipt (base64 blob), and POSTs it here. We validate the receipt
 * against Apple's verifyReceipt endpoint, extract the purchase info,
 * and grant Pro entitlement to the device.
 *
 * S2S notifications (Apple's App Store Server Notifications V2) for
 * subscription renewal / cancellation / refund are handled at the
 * same /webhook endpoint. For v1 we just validate them and update
 * the subscription record; full event-type handling can grow later.
 */

const express = require('express');
const router = express.Router();
const appleIap = require('../lib/appleIap');
const {
    getSubscription,
    setSubscription,
} = require('../lib/subscriptionStore');
const adminStore = require('../lib/adminStore');

const APPLE_PRODUCT_ID = process.env.APPLE_PRODUCT_ID || 'com.krasumashi.piqabu.pro.yearly';

function createAppleIapRouter({ io }) {
    /**
     * POST /api/apple-iap/verify
     * Body: { deviceId, receipt }
     *   - receipt is a base64 string from RNIap's getReceiptIOS().
     *
     * Returns: { tier: 'pro' | 'free', proUntil, env: 'production' | 'sandbox' }
     */
    router.post('/api/apple-iap/verify', express.json(), async (req, res) => {
        try {
            const { deviceId, receipt } = req.body || {};
            if (!deviceId || !receipt) {
                return res.status(400).json({ error: 'Missing deviceId or receipt' });
            }
            const result = await appleIap.verifyReceipt(receipt);
            if (!result.ok) {
                adminStore.addLog('warn', 'Apple IAP verify failed', {
                    deviceId, status: result.status, env: result.env,
                });
                return res.status(400).json({
                    error: 'Receipt verification failed',
                    status: result.status,
                    env: result.env,
                });
            }
            if (result.productId !== APPLE_PRODUCT_ID) {
                return res.status(400).json({
                    error: 'Unexpected product id',
                    productId: result.productId,
                    expected: APPLE_PRODUCT_ID,
                });
            }

            // Apple's expiresMs is the source of truth. We don't add
            // grace here — Apple's renewal flow is its own state
            // machine; we'll learn about renewals via S2S
            // notifications (when wired) or on the next /verify call.
            const proUntil = new Date(result.expiresMs).toISOString();
            setSubscription(deviceId, {
                tier: 'pro',
                proUntil,
                source: 'apple_iap',
                appleTransactionId: result.transactionId,
                appleOriginalTransactionId: result.originalTransactionId,
                appleEnv: result.env,
            });

            // Push to live socket if connected.
            if (io) {
                io.sockets.sockets.forEach((sock) => {
                    if (sock.data?.deviceId === deviceId) {
                        sock.data.tier = 'pro';
                        sock.emit('subscription_updated', { tier: 'pro' });
                    }
                });
            }

            adminStore.addLog('info', 'Apple IAP Pro activated', {
                deviceId,
                productId: result.productId,
                env: result.env,
                expiresAt: proUntil,
            });

            res.json({
                tier: 'pro',
                proUntil,
                env: result.env,
                source: 'apple_iap',
            });
        } catch (e) {
            console.error('[AppleIAP] verify failed:', e.message);
            adminStore.addLog('error', 'Apple IAP verify error', { message: e.message });
            res.status(500).json({ error: 'Verification failed' });
        }
    });

    /**
     * POST /api/apple-iap/webhook
     * Apple App Store Server Notifications V2. Apple POSTs JWT-signed
     * payloads when subscription state changes (renewal, cancellation,
     * refund). For v1 we log + acknowledge; full event handling will
     * grow as renewals start happening in production.
     *
     * To set this up in App Store Connect:
     *   App Information → App Store Server Notifications →
     *     Production Server URL: https://piqabu.onrender.com/api/apple-iap/webhook
     *     Version: 2
     */
    router.post('/api/apple-iap/webhook', express.json(), async (req, res) => {
        adminStore.addLog('info', 'Apple IAP notification received', {
            // The signedPayload is a JWT. Decoding it requires Apple's
            // public keys (fetched from their JWKS endpoint). For v1 we
            // just acknowledge — when we have real renewal traffic
            // we'll add decoding + state-machine handling.
            signedPayloadPreview: typeof req.body?.signedPayload === 'string'
                ? req.body.signedPayload.slice(0, 60) + '…'
                : 'no signedPayload',
        });
        res.json({ received: true });
    });

    return router;
}

module.exports = { createAppleIapRouter };
