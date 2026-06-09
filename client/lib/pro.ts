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
import { NativeModules, Platform } from 'react-native';
import { getSecureItem, setSecureItem } from './platform/storage';

const PRO_KEY = 'piqabu_pro_status';

/**
 * Mirror the Pro flag into the Piqabu Keyboard's cross-process
 * SharedPreferences file. The IME runs in its own process and can't
 * read expo-secure-store, so we additionally publish the boolean to a
 * plaintext prefs file the IME's SecureStoreReader.kt reads. Pro
 * status is not a secret; full rationale in bridge/PiqabuKeyboardBridgeModule.kt.
 *
 * Best-effort: if the native module isn't loaded (web, dev client
 * without the rebuild) we silently noop. The in-app gates still work
 * because they read from secure-store directly.
 */
async function mirrorProStatusToNative(isPro: boolean): Promise<void> {
    if (Platform.OS !== 'android') return;
    const bridge = (NativeModules as Record<string, unknown>).PiqabuKeyboardBridge as
        | { setProStatus?: (isPro: boolean) => Promise<void> }
        | undefined;
    if (!bridge || typeof bridge.setProStatus !== 'function') return;
    try { await bridge.setProStatus(isPro); } catch { /* noop */ }
}

export async function hasProAccess(): Promise<boolean> {
    try {
        const raw = await getSecureItem(PRO_KEY);
        return raw === '1';
    } catch {
        return false;
    }
}

/**
 * Reconcile the IME bridge with the secure-store source-of-truth.
 * Call on app launch so the keyboard knows the user's current tier
 * even when the user never opens the paywall in this session — e.g.
 * after a fresh install where secure-store was restored but the
 * bridge prefs file was created empty.
 */
export async function syncProStatusToBridge(): Promise<void> {
    const isPro = await hasProAccess();
    await mirrorProStatusToNative(isPro);
}

export async function setProAccess(isPro: boolean): Promise<void> {
    try { await setSecureItem(PRO_KEY, isPro ? '1' : '0'); } catch { /* noop */ }
    // Fire-and-forget mirror to the IME bridge. Ordering doesn't matter —
    // the keyboard re-checks Pro on every onStartInputView so the next
    // activation picks up whichever value finished writing last.
    void mirrorProStatusToNative(isPro);
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
