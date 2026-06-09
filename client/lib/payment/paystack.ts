/**
 * Paystack checkout helper for the Piqabu client.
 *
 * Flow (matches server/routes/paystack.js):
 *
 *   1. startCheckout({ deviceId, email? })
 *      - POSTs to /api/paystack/init on our server.
 *      - Server starts a Paystack transaction, returns auth URL +
 *        reference.
 *      - We open the auth URL via expo-web-browser's
 *        openAuthSessionAsync. That uses Chrome Custom Tabs on Android
 *        and SFSafariViewController on iOS — modal-feeling, not a hard
 *        app switch.
 *      - When Paystack redirects to our callback URL (piqabu.live/upgrade)
 *        the auth session closes and returns { type, url } to us.
 *
 *   2. After the session closes — regardless of how it closed (success,
 *      user-dismissed, redirected, errored) — we POLL the server's
 *      /api/paystack/status/:deviceId endpoint. The server does an
 *      out-of-band verifyTransaction on Paystack if our local record
 *      hasn't yet been updated by the webhook. This is the recovery
 *      path for a slow/lost webhook.
 *
 *   3. When status.tier === 'pro' we resolve the Promise with success.
 *      Caller (upgrade.tsx) is responsible for calling setProAccess(true)
 *      to mirror the entitlement into the IME bridge and surface
 *      whatever UI cue.
 *
 * Privacy posture:
 *   - Email is optional. If the caller doesn't supply one, the server
 *     synthesizes <ghost-id-prefix>@piqabu.live. Paystack accepts that
 *     as the customer record; Piqabu doesn't keep a copy of it after
 *     the transaction.
 *   - No analytics. The transaction reference is only ever logged to
 *     the admin Audit pane (operator-visible) and never persisted past
 *     the subscription record itself.
 */

import * as WebBrowser from 'expo-web-browser';
import { CONFIG } from '../../constants/Config';

export interface CheckoutResult {
    kind: 'success' | 'cancelled' | 'pending' | 'error';
    proUntil?: string | null;
    reason?: string;
}

interface InitResponse {
    authorization_url: string;
    reference: string;
    amount: number;
    currency: string;
}

interface StatusResponse {
    tier: 'free' | 'pro';
    proUntil: string | null;
    graceUntil?: string | null;
    inGracePeriod?: boolean;
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

async function postInit(deviceId: string, email?: string): Promise<InitResponse> {
    const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/paystack/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, email }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`init failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return res.json();
}

async function fetchStatus(deviceId: string): Promise<StatusResponse> {
    const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/paystack/status/${encodeURIComponent(deviceId)}`);
    if (!res.ok) throw new Error(`status failed (${res.status})`);
    return res.json();
}

/** Poll /status until tier flips to 'pro' or the timeout elapses. The
 *  server-side handler will do an out-of-band verify if our local
 *  record is still stale, so polling actively pulls the entitlement
 *  forward even when the webhook is late. */
async function pollUntilPro(deviceId: string): Promise<StatusResponse | null> {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
        try {
            const status = await fetchStatus(deviceId);
            if (status.tier === 'pro') return status;
        } catch { /* ignore — retry */ }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
}

export async function startCheckout(
    { deviceId, email }: { deviceId: string; email?: string },
): Promise<CheckoutResult> {
    let init: InitResponse;
    try {
        init = await postInit(deviceId, email);
    } catch (e) {
        return { kind: 'error', reason: e instanceof Error ? e.message : 'Could not start payment.' };
    }

    let browserResult: WebBrowser.WebBrowserAuthSessionResult;
    try {
        // The "return URL" tells openAuthSessionAsync which URL to
        // match on to close the session and hand control back to us.
        // We match exactly the same URL the server sent Paystack as
        // callback_url so the WebView closes the moment Paystack
        // redirects.
        browserResult = await WebBrowser.openAuthSessionAsync(
            init.authorization_url,
            'https://piqabu.live/upgrade',
        );
    } catch (e) {
        return { kind: 'error', reason: e instanceof Error ? e.message : 'Could not open checkout.' };
    }

    // The WebView is now closed. Regardless of HOW it closed (success
    // redirect, user-dismissed, system-cancelled), we poll the server
    // for the canonical state of this device's subscription — that's
    // the source-of-truth, not the WebView's exit code.
    const status = await pollUntilPro(deviceId);
    if (status && status.tier === 'pro') {
        return { kind: 'success', proUntil: status.proUntil };
    }

    // No 'pro' inside the poll window. Two cases collapsed:
    //   - user dismissed the WebView before paying           → 'cancelled'
    //   - paid but the verify hasn't landed yet (extreme tail) → 'pending'
    // We can't distinguish reliably; the UI handles both the same way
    // (offer to retry or contact support).
    if (browserResult.type === 'success') {
        return { kind: 'pending' };
    }
    return { kind: 'cancelled' };
}
