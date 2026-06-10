/**
 * usePricing — pulls the currently configured Pro price from the server.
 *
 * Single source of truth across every surface that displays the price
 * (upgrade screen, settings panel, renew banner). The server reads the
 * price from env (PRO_PRICE_MINOR_UNITS + PRO_CURRENCY) and renders the
 * display string with the right symbol and decimals — so changing the
 * price post-launch is a single env-var update on Render, and the
 * client pulls it on next launch.
 *
 * Cached module-level so multiple components don't burn round trips.
 * Falls back to a sensible default if the network is down, so the
 * paywall still renders something — the default matches what we're
 * actually charging so a stale cache can't mislead users.
 */
import { useEffect, useState } from 'react';
import { CONFIG } from '../../constants/Config';

export interface Pricing {
    amount: number;       // lowest currency unit (pesewas, cents, kobo)
    currency: string;     // ISO 4217 code, e.g. 'GHS'
    displayPrice: string; // pre-formatted with symbol, e.g. '₵300'
    displaySymbol: string;
    periodLabel: string;  // 'year', 'month', ...
}

// Compile-time fallback — matches the server's defaults so the UI
// never renders an empty price. Updated whenever we change pricing.
const FALLBACK: Pricing = {
    amount: 30000,
    currency: 'GHS',
    displayPrice: '₵300',
    displaySymbol: '₵',
    periodLabel: 'year',
};

let cache: Pricing | null = null;
let inflight: Promise<Pricing> | null = null;

async function fetchPricing(): Promise<Pricing> {
    if (cache) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/paystack/pricing`);
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json() as Pricing;
            cache = data;
            return data;
        } catch {
            cache = FALLBACK;
            return FALLBACK;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

export function usePricing(): { pricing: Pricing; loaded: boolean } {
    const [pricing, setPricing] = useState<Pricing>(cache ?? FALLBACK);
    const [loaded, setLoaded] = useState<boolean>(cache != null);
    useEffect(() => {
        let alive = true;
        fetchPricing().then(p => {
            if (alive) { setPricing(p); setLoaded(true); }
        });
        return () => { alive = false; };
    }, []);
    return { pricing, loaded };
}
