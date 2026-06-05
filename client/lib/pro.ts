/**
 * Pro-tier access helpers (pseudo paywall, real wiring TBD).
 *
 * The Pro flag lives in `expo-secure-store` under `piqabu_pro_status`.
 *   '1'    → Pro
 *   '0'    → Free (or absent / never set)
 *
 * Today this is a local-only boolean — the pseudo paywall just sets it
 * when the user taps "Subscribe". When the real RevenueCat integration
 * ships, the purchase callback should call `setProAccess(true)` and the
 * sub-status restore on app launch should reconcile. Everything else
 * keeps working — the gates only read `hasProAccess()`.
 *
 * The same key is what the Piqabu Keyboard (native Android, Phase 3
 * SecureStoreReader) will read across processes when it checks whether
 * to render the input view or show the upgrade gate.
 */
import { useEffect, useState, useCallback } from 'react';
import { getSecureItem, setSecureItem } from './platform/storage';

const PRO_KEY = 'piqabu_pro_status';

export async function hasProAccess(): Promise<boolean> {
    try {
        const raw = await getSecureItem(PRO_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

export async function setProAccess(isPro: boolean): Promise<void> {
    try { await setSecureItem(PRO_KEY, isPro ? '1' : '0'); } catch { /* noop */ }
}

/**
 * Reactive hook for components that need to react to Pro changes.
 * `refresh()` re-reads the secure-store value — call it after a
 * paywall mutation so the parent component re-renders with the new
 * tier state.
 */
export function useProAccess(): {
    isPro: boolean;
    loaded: boolean;
    refresh: () => Promise<void>;
} {
    const [isPro, setIsPro] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(async () => {
        const v = await hasProAccess();
        setIsPro(v);
        setLoaded(true);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return { isPro, loaded, refresh };
}
