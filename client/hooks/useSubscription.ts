import { useState, useEffect, useCallback } from 'react';
import { Tier, TierLimits, TIERS } from '../lib/subscription/tiers';
import { hasProAccess, syncProAccessFromServer } from '../lib/pro';

/**
 * Subscription/entitlement hook — the single source of `isPro` for the app.
 *
 * Source of truth is the SERVER (`/api/paystack/status/:deviceId`), which
 * knows about the 3-day trial, Paystack purchases, Apple IAP, and Mission
 * Control overrides, and mirrors the result into secure-store. We pull the
 * latest from the server, then read the mirrored flag via hasProAccess().
 *
 * IMPORTANT: this used to read tier from RevenueCat
 * (`getSubscriptionStatus()`), which has NO knowledge of the Paystack trial
 * or Paystack purchases — so during the trial it returned 'free' and every
 * Pro gate stayed walled even though the trial was active. Reading the
 * real entitlement makes the trial unlock Pro features automatically for
 * its 3 days, then re-lock to free when the server reports expiry.
 */
export function useSubscription(deviceId: string | null) {
    const [tier, setTier] = useState<Tier>('free');
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!deviceId) return;
        setIsLoading(true);
        try {
            // Reconcile with the server (grants/expires the trial, picks up
            // Paystack/Apple/admin changes), then read the mirrored flag.
            await syncProAccessFromServer(deviceId);
            const pro = await hasProAccess();
            setTier(pro ? 'pro' : 'free');
        } catch {
            // Offline / dev — fall back to whatever secure-store already has
            // so a flaky network doesn't downgrade a paid/trial user.
            try { setTier((await hasProAccess()) ? 'pro' : 'free'); } catch { /* noop */ }
        }
        setIsLoading(false);
    }, [deviceId]);

    useEffect(() => { void refresh(); }, [refresh]);

    const limits: TierLimits = TIERS[tier];

    return {
        tier,
        isLoading,
        limits,
        isPro: tier === 'pro',
        refresh,
    };
}
