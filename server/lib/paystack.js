/**
 * Paystack API client.
 *
 * Three responsibilities:
 *   - initializeTransaction(): start a payment, returns auth URL + reference
 *   - verifyTransaction(): server-side check that a payment really succeeded
 *   - verifyWebhookSignature(): HMAC SHA-512 check on webhook delivery
 *
 * Keys are read lazily so the server still boots in dev / preview without
 * Paystack configured. Every entry point throws a clear error if called
 * without PAYSTACK_SECRET_KEY in env.
 */

const crypto = require('crypto');
const https = require('https');

const PAYSTACK_API_HOST = 'api.paystack.co';

function getSecretKey() {
    const k = process.env.PAYSTACK_SECRET_KEY;
    if (!k) throw new Error('PAYSTACK_SECRET_KEY not configured');
    return k;
}

/**
 * Make an authenticated HTTPS request to Paystack and return parsed JSON.
 * We're avoiding adding `node-fetch` / `axios` to keep the dependency
 * surface small; native https + Promise is enough.
 */
function paystackRequest({ method, path, body }) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: PAYSTACK_API_HOST,
            port: 443,
            path,
            method,
            headers: {
                Authorization: `Bearer ${getSecretKey()}`,
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                try {
                    const json = JSON.parse(raw);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(`Paystack ${method} ${path} failed (${res.statusCode}): ${json.message || raw}`));
                    }
                } catch (e) {
                    reject(new Error(`Paystack ${method} ${path}: non-JSON response: ${raw.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

/**
 * Start a Paystack transaction.
 *
 * @param {Object} args
 * @param {string} args.email     — required by Paystack. Either a real
 *                                   user-supplied address or a derived
 *                                   placeholder (see routes/paystack.js).
 * @param {number} args.amount    — in the lowest currency unit. For USD
 *                                   this is cents — $25 → 2500.
 * @param {string} [args.currency]  — defaults to USD. Paystack requires
 *                                     the merchant to have that currency
 *                                     enabled.
 * @param {string} [args.callbackUrl] — where Paystack should redirect the
 *                                       checkout WebView after payment.
 * @param {object} [args.metadata]   — arbitrary k/v map echoed back to us
 *                                     via the webhook. We stash deviceId
 *                                     here.
 *
 * @returns {Promise<{ authorization_url, reference, access_code }>}
 */
async function initializeTransaction({ email, amount, currency = 'USD', callbackUrl, metadata }) {
    const body = {
        email,
        amount,
        currency,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        ...(metadata ? { metadata } : {}),
    };
    const json = await paystackRequest({
        method: 'POST',
        path: '/transaction/initialize',
        body,
    });
    if (!json?.status || !json?.data?.authorization_url) {
        throw new Error('Paystack initialize: malformed response');
    }
    return json.data;
}

/**
 * Verify a Paystack transaction by reference.
 *
 * Used in two places:
 *   - As a fallback to the webhook (client polls /status, which calls this).
 *   - As a sanity check inside the webhook handler before flipping any
 *     entitlement — never trust the event payload alone.
 *
 * @param {string} reference
 * @returns {Promise<{ status, amount, currency, customer, metadata, ... }>}
 */
async function verifyTransaction(reference) {
    const json = await paystackRequest({
        method: 'GET',
        path: `/transaction/verify/${encodeURIComponent(reference)}`,
    });
    if (!json?.status) {
        throw new Error('Paystack verify: malformed response');
    }
    return json.data;
}

/**
 * Verify a Paystack webhook signature.
 *
 * Paystack signs the raw request body with HMAC-SHA512 using the same
 * secret key, and puts the hex digest in the `x-paystack-signature`
 * header. The webhook handler MUST use a raw-body parser (not JSON) so
 * we can compute the digest over the exact bytes Paystack signed.
 *
 * @param {Buffer|string} rawBody
 * @param {string} signature  — value of the x-paystack-signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
    if (!signature) return false;
    const secret = getSecretKey();
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    // timingSafeEqual prevents leaking signature bytes via response time.
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(signature), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = {
    initializeTransaction,
    verifyTransaction,
    verifyWebhookSignature,
};
