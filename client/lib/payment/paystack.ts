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

import { CONFIG } from '../../constants/Config';

// Defensive import: expo-web-browser is a native module added in
// commit dd563ec ("Paystack integration"). Users still on a build
// that predates that commit (v0.1.0) won't have the native side
// installed, and a static `import * as WebBrowser from ...` would
// throw on module load — locking the whole app out, not just
// the checkout. Lazy-require here so we can detect the absence
// and surface a friendly error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WebBrowser: any = null;
function getWebBrowser(): {
    openAuthSessionAsync?: (url: string, redirectUrl?: string) => Promise<{ type: string; url?: string }>;
} | null {
    if (WebBrowser) return WebBrowser;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        WebBrowser = require('expo-web-browser');
    } catch {
        WebBrowser = null;
    }
    return WebBrowser;
}

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
    source?: string | null;
    isTrial?: boolean;
    // Paystack reference of the most recent SUCCESSFUL purchase.
    // Used to detect whether the specific transaction we just kicked off
    // landed — distinguishing it from "device is already on a trial."
    paystackReference?: string | null;
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

/** Poll /status until the SPECIFIC paystack reference we just initialized
 *  has been verified successful. This is the canonical way to detect
 *  "this purchase landed" — using tier=='pro' alone is wrong because the
 *  device may already be on a 7-day trial (which the server reports as
 *  'pro' with source='trial'). We need to detect a state change tied to
 *  THIS specific transaction.
 *
 *  The server-side handler does an out-of-band verify against Paystack
 *  if the pending reference matches our expected reference and the
 *  record is still trial/free. So polling actively pulls the entitlement
 *  forward even when the webhook is late. */
async function pollUntilReferenceActivated(deviceId: string, expectedReference: string): Promise<StatusResponse | null> {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
        try {
            const status = await fetchStatus(deviceId);
            if (status.tier === 'pro' && status.paystackReference === expectedReference) {
                return status;
            }
        } catch { /* ignore — retry */ }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return null;
}

export async function startCheckout(
    { deviceId, email }: { deviceId: string; email?: string },
): Promise<CheckoutResult> {
    // Guard against the v0.1.0 APK that doesn't have expo-web-browser
    // in its native build. Without this check the upgrade screen
    // bridges into a missing native module, hangs, and the user is
    // stuck on a dark screen with no way back.
    const wb = getWebBrowser();
    if (!wb || typeof wb.openAuthSessionAsync !== 'function') {
        return {
            kind: 'error',
            reason: 'Payments aren\'t available in this build of Piqabu. Please update to the latest version (a new install required, not just relaunch) and try again.',
        };
    }

    let init: InitResponse;
    try {
        init = await postInit(deviceId, email);
    } catch (e) {
        return { kind: 'error', reason: e instanceof Error ? e.message : 'Could not start payment.' };
    }

    let browserResult: { type: string; url?: string };
    try {
        // The "return URL" tells openAuthSessionAsync which URL to
        // match on to close the session and hand control back to us.
        // We match exactly the same URL the server sent Paystack as
        // callback_url so the WebView closes the moment Paystack
        // redirects.
        browserResult = await wb.openAuthSessionAsync(
            init.authorization_url,
            'https://piqabu.live/upgrade',
        );
    } catch (e) {
        return { kind: 'error', reason: e instanceof Error ? e.message : 'Could not open checkout.' };
    }

    // The WebView is now closed. Regardless of HOW it closed (success
    // redirect, user-dismissed, system-cancelled), we poll the server
    // for the canonical state of this device's subscription — that's
    // the source-of-truth, not the WebView's exit code. CRITICALLY,
    // we poll for THIS reference's activation, not just any 'pro'
    // state — otherwise a trial user who closes the webview without
    // paying would falsely see "PRO ACTIVATED" because their trial
    // status reports tier='pro'.
    const status = await pollUntilReferenceActivated(deviceId, init.reference);
    if (status && status.tier === 'pro' && status.paystackReference === init.reference) {
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
