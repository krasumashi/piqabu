import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Tier, TierLimits, TIERS } from '../lib/subscription/tiers';

export function useSubscription(deviceId: string | null) {
    const [tier, setTier] = useState<Tier>('free');
    const [isLoading, setIsLoading] = useState(true);

    // Check subscription status on mount and when deviceId changes
    useEffect(() => {
        if (!deviceId) return;

        const checkStatus = async () => {
            setIsLoading(true);

            if (Platform.OS === 'web') {
                // Web: check via Stripe API
                const { getWebSubscriptionStatus } = await import('../lib/subscription/stripe');
                const status = await getWebSubscriptionStatus(deviceId);
                setTier(status);
            } else {
                // Native: check via RevenueCat
                const { initRevenueCat, getSubscriptionStatus } = await import('../lib/subscription/revenueCat');
                await initRevenueCat(deviceId);
                const status = await getSubscriptionStatus();
                setTier(status);
            }

            setIsLoading(false);
        };

        checkStatus();
    }, [deviceId]);

    const refresh = useCallback(async () => {
        if (!deviceId) return;
        setIsLoading(true);

        if (Platform.OS === 'web') {
            const { getWebSubscriptionStatus } = await import('../lib/subscription/stripe');
            const status = await getWebSubscriptionStatus(deviceId);
            setTier(status);
        } else {
            const { getSubscriptionStatus } = await import('../lib/subscription/revenueCat');
            const status = await getSubscriptionStatus();
            setTier(status);
        }

        setIsLoading(false);
    }, [deviceId]);

    const limits: TierLimits = TIERS[tier];

    return {
        tier,
        isLoading,
        limits,
        isPro: tier === 'pro',
        refresh,
    };
}
