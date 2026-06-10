/**
 * Apple In-App Purchase receipt verification.
 *
 * iOS users buy Piqabu Pro through Apple's IAP system. The client
 * sends us the transaction receipt; we POST it to Apple's verifyReceipt
 * endpoint to confirm it's valid before granting Pro entitlement.
 * Server-side verification is mandatory — never trust a client-side
 * IAP claim (trivially spoofable).
 *
 * We use the legacy /verifyReceipt endpoint rather than the newer App
 * Store Server API because it's simpler (no JWT signing), still
 * supported by Apple, and our volume doesn't justify the migration.
 *
 * The shared secret comes from App Store Connect → My Apps → Piqabu →
 * App Information → App-Specific Shared Secret. It must be set as
 * APPLE_IAP_SHARED_SECRET on the server (Render env var).
 *
 * Sandbox vs production:
 *   - During TestFlight testing, receipts come from the sandbox
 *     environment. Apple's documented pattern is: try production
 *     first; if Apple returns status 21007 ("sandbox receipt sent to
 *     production"), retry against sandbox. Implemented below.
 *
 * Privacy:
 *   - No customer PII passes through this endpoint. The receipt
 *     contains transaction info and the product ID; we extract
 *     proUntil and a transaction ID.
 *   - Apple doesn't tell us who the user is — that's their privacy
 *     posture, fine with us.
 */

const https = require('https');

const PROD_HOST = 'buy.itunes.apple.com';
const SANDBOX_HOST = 'sandbox.itunes.apple.com';
const VERIFY_PATH = '/verifyReceipt';

function getSharedSecret() {
    const s = process.env.APPLE_IAP_SHARED_SECRET;
    if (!s) throw new Error('APPLE_IAP_SHARED_SECRET not configured');
    return s;
}

/** Post the receipt to Apple's verifyReceipt endpoint and parse JSON. */
function appleRequest(host, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: host,
            port: 443,
            path: VERIFY_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error(`Apple verifyReceipt: bad JSON: ${raw.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Verify an iOS IAP receipt.
 *
 * @param {string} receiptData — base64-encoded receipt string from the client
 * @returns {Promise<{ ok, productId, transactionId, originalTransactionId, purchaseDateMs, expiresMs, env }>}
 */
async function verifyReceipt(receiptData) {
    if (!receiptData || typeof receiptData !== 'string') {
        throw new Error('Invalid receipt data');
    }
    const body = {
        'receipt-data': receiptData,
        'password': getSharedSecret(),
        // exclude-old-transactions: only the most recent renewal per
        // product. Keeps our work simple.
        'exclude-old-transactions': true,
    };

    // Try production first per Apple's recommended pattern.
    let env = 'production';
    let resp = await appleRequest(PROD_HOST, body);
    if (resp.status === 21007) {
        env = 'sandbox';
        resp = await appleRequest(SANDBOX_HOST, body);
    }

    if (resp.status !== 0) {
        return { ok: false, env, status: resp.status };
    }

    // Receipt is valid. Pull the most recent transaction for our
    // expected product. For an Auto-Renewable Subscription, look at
    // latest_receipt_info; for a one-shot Non-Consumable, look at
    // in_app.
    const latest = Array.isArray(resp.latest_receipt_info) && resp.latest_receipt_info.length
        ? resp.latest_receipt_info[0]
        : (Array.isArray(resp.receipt?.in_app) && resp.receipt.in_app.length
            ? resp.receipt.in_app[0]
            : null);

    if (!latest) {
        return { ok: false, env, status: 'no-transaction-in-receipt' };
    }

    const purchaseDateMs = Number(latest.purchase_date_ms) || Date.now();
    const expiresMs = latest.expires_date_ms
        ? Number(latest.expires_date_ms)
        : purchaseDateMs + 365 * 24 * 60 * 60 * 1000; // 1y for non-consumable

    return {
        ok: true,
        env,
        productId: latest.product_id,
        transactionId: latest.transaction_id,
        originalTransactionId: latest.original_transaction_id,
        purchaseDateMs,
        expiresMs,
    };
}

module.exports = { verifyReceipt };
