/**
 * Apple In-App Purchase client wrapper.
 *
 * iOS-only. The Android side uses Paystack (see paystack.ts).
 *
 * Flow:
 *   1. initConnection() — must be called once before any other IAP
 *      operation.
 *   2. Subscribe to purchaseUpdatedListener / purchaseErrorListener
 *      BEFORE calling requestPurchase. react-native-iap's purchase
 *      flow is event-driven on iOS — the call kicks off the OS sheet,
 *      results arrive on the listeners.
 *   3. Call requestPurchase with the product SKU.
 *   4. On purchaseUpdatedListener fire, grab the transactionReceipt
 *      and POST it to /api/apple-iap/verify. Server-side verification
 *      is mandatory — never trust the client receipt alone.
 *   5. Call finishTransaction(purchase, false) so Apple stops
 *      re-delivering the same purchase on every app launch.
 *
 * react-native-iap is a native dep — EAS build required to ship.
 * Until the build lands, calling startAppleCheckout will return an
 * error result, which upgrade.tsx handles with a clean message.
 */

import { Platform } from 'react-native';
import { CONFIG } from '../../constants/Config';

export interface AppleCheckoutResult {
    kind: 'success' | 'cancelled' | 'pending' | 'error';
    proUntil?: string | null;
    reason?: string;
}

export const PIQABU_PRO_PRODUCT_ID = 'com.krasumashi.piqabu.pro.yearly';

// `any` here intentional — react-native-iap's nitro types are
// version-fragile and we don't want them to break this build. The
// runtime call shape is stable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let iapModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIap(): any {
    if (iapModule) return iapModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        iapModule = require('react-native-iap');
    } catch {
        iapModule = null;
    }
    return iapModule;
}

async function postVerify(deviceId: string, receipt: string): Promise<{ tier: 'pro' | 'free'; proUntil: string | null } | null> {
    try {
        const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/apple-iap/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, receipt }),
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

const PURCHASE_TIMEOUT_MS = 90_000;

/**
 * Kick off an Apple IAP subscription purchase. Returns when the
 * purchase + server verification has either succeeded or definitively
 * failed.
 */
export async function startAppleCheckout({ deviceId }: { deviceId: string }): Promise<AppleCheckoutResult> {
    if (Platform.OS !== 'ios') {
        return { kind: 'error', reason: 'Apple IAP is iOS-only.' };
    }
    const IAP = getIap();
    if (!IAP) {
        // Module not installed at native level — happens in dev client
        // builds that pre-date the native rebuild.
        return { kind: 'error', reason: 'Payments aren\'t available in this build. Please update Piqabu from the App Store.' };
    }

    try {
        await IAP.initConnection();
    } catch {
        return { kind: 'error', reason: 'Could not connect to the App Store.' };
    }

    // Set up listeners BEFORE calling requestPurchase — iOS posts the
    // result asynchronously, so the listener must already be in place.
    return await new Promise<AppleCheckoutResult>((resolve) => {
        let resolved = false;
        const safeResolve = (r: AppleCheckoutResult) => {
            if (resolved) return;
            resolved = true;
            try { purchaseSub?.remove?.(); } catch { /* noop */ }
            try { errorSub?.remove?.(); } catch { /* noop */ }
            resolve(r);
        };

        const purchaseSub = IAP.purchaseUpdatedListener(async (purchase: { transactionReceipt?: string }) => {
            const receipt = purchase?.transactionReceipt;
            if (!receipt) {
                return safeResolve({ kind: 'error', reason: 'Apple returned no receipt.' });
            }
            const verifyResult = await postVerify(deviceId, receipt);
            if (!verifyResult || verifyResult.tier !== 'pro') {
                return safeResolve({
                    kind: 'pending',
                    reason: 'Payment received. Verification is taking longer than usual.',
                });
            }
            try {
                await IAP.finishTransaction({ purchase, isConsumable: false });
            } catch { /* noop */ }
            safeResolve({ kind: 'success', proUntil: verifyResult.proUntil });
        });

        const errorSub = IAP.purchaseErrorListener((err: { code?: string; message?: string }) => {
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('cancel') || err?.code === 'E_USER_CANCELLED') {
                return safeResolve({ kind: 'cancelled' });
            }
            safeResolve({ kind: 'error', reason: 'Apple Pay didn\'t complete. Please try again.' });
        });

        // Timeout — if neither listener fires in 90s, assume something
        // hung and let the user retry.
        setTimeout(() => {
            safeResolve({ kind: 'pending', reason: 'Apple Pay timed out. Try again.' });
        }, PURCHASE_TIMEOUT_MS);

        // Kick off the OS sheet. Both shapes work in modern
        // react-native-iap, but iOS prefers the `ios: { sku }` form.
        try {
            IAP.requestPurchase({
                ios: { sku: PIQABU_PRO_PRODUCT_ID },
            });
        } catch {
            safeResolve({ kind: 'error', reason: 'Could not open the App Store sheet.' });
        }
    });
}
