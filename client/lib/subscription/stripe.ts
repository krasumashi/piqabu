import { Platform } from 'react-native';
import { CONFIG } from '../../constants/Config';
import { Tier } from './tiers';

// Web-only Stripe integration

export async function createCheckoutSession(
    deviceId: string,
    priceId: string
): Promise<string | null> {
    if (Platform.OS !== 'web') return null;

    try {
        const response = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/create-checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, priceId }),
        });

        if (!response.ok) {
            console.error('[Stripe] Checkout session creation failed');
            return null;
        }

        const { url } = await response.json();
        return url;
    } catch (e) {
        console.error('[Stripe] Error:', e);
        return null;
    }
}

export async function getWebSubscriptionStatus(deviceId: string): Promise<Tier> {
    if (Platform.OS !== 'web') return 'free';

    try {
        const response = await fetch(
            `${CONFIG.SIGNAL_TOWER_URL}/api/subscription-status/${encodeURIComponent(deviceId)}`
        );
        if (!response.ok) return 'free';

        const { tier } = await response.json();
        return tier === 'pro' ? 'pro' : 'free';
    } catch (e) {
        console.error('[Stripe] Status check failed:', e);
        return 'free';
    }
}

export function redirectToCheckout(url: string): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = url;
    }
}
