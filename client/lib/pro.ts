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
const PRO_UNTIL_KEY = 'piqabu_pro_until';     // ISO timestamp of expiry
const GRACE_UNTIL_KEY = 'piqabu_grace_until';  // ISO timestamp of grace end
const PRO_SOURCE_KEY = 'piqabu_pro_source';    // 'trial' | 'paystack' | 'apple_iap' | 'admin'

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

/**
 * Piqabu is free for everyone. There is no consumer Pro tier anymore —
 * the app is an experimental, donation-supported privacy study, and every
 * feature (including the keyboard) is unlocked for all users. This always
 * resolves true so every legacy `isPro` gate reads as unlocked.
 *
 * The entitlement plumbing below (setProAccess, timelines, the server
 * sync) is kept dormant so the Institutional tier can repurpose it later
 * — it just no longer governs individual access.
 */
export async function hasProAccess(): Promise<boolean> {
    return true;
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

export async function setProAccess(isPro: boolean, opts?: { proUntil?: string | null; graceUntil?: string | null; source?: string | null }): Promise<void> {
    try { await setSecureItem(PRO_KEY, isPro ? '1' : '0'); } catch { /* noop */ }
    // Persist the dates locally so the renew-soon prompt can render
    // without a network round-trip. Server is still the source of
    // truth on the next /status poll.
    if (opts?.proUntil) {
        try { await setSecureItem(PRO_UNTIL_KEY, opts.proUntil); } catch { /* noop */ }
    }
    if (opts?.graceUntil) {
        try { await setSecureItem(GRACE_UNTIL_KEY, opts.graceUntil); } catch { /* noop */ }
    }
    if (opts?.source) {
        try { await setSecureItem(PRO_SOURCE_KEY, opts.source); } catch { /* noop */ }
    }
    // Fire-and-forget mirror to the IME bridge. Ordering doesn't matter —
    // the keyboard re-checks Pro on every onStartInputView so the next
    // activation picks up whichever value finished writing last.
    void mirrorProStatusToNative(isPro);
}

export interface ProTimeline {
    proUntil: string | null;
    graceUntil: string | null;
    /** True when proUntil has passed but graceUntil hasn't — the
     *  "renew now or you lose Pro" window. */
    inGracePeriod: boolean;
    /** Whole days until proUntil (renewal due). Negative once we're in
     *  grace. Null when there's no expiry recorded (Mission Control
     *  tier overrides, free tier). */
    daysUntilExpiry: number | null;
    /** Whole days until graceUntil (hard lockout). Null in normal
     *  pre-expiry state. */
    daysUntilHardLockout: number | null;
    /** 'trial' | 'paystack' | 'apple_iap' | 'admin' | null */
    source: string | null;
    /** True when source==='trial' AND we're inside proUntil — i.e. the
     *  free 3-day trial is currently active. UI labels Pro as "TRIAL"
     *  rather than "PRO" in this state. */
    isTrial: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function computeTimeline(proUntilISO: string | null, graceUntilISO: string | null, source: string | null): ProTimeline {
    const now = Date.now();
    const proUntilMs = proUntilISO ? new Date(proUntilISO).getTime() : null;
    const graceUntilMs = graceUntilISO ? new Date(graceUntilISO).getTime() : null;
    const inGracePeriod = !!(proUntilMs && graceUntilMs && now >= proUntilMs && now < graceUntilMs);
    const isTrial = source === 'trial' && !!proUntilMs && now < proUntilMs;
    return {
        proUntil: proUntilISO,
        graceUntil: graceUntilISO,
        inGracePeriod,
        daysUntilExpiry: proUntilMs != null
            ? Math.ceil((proUntilMs - now) / DAY_MS)
            : null,
        daysUntilHardLockout: inGracePeriod && graceUntilMs != null
            ? Math.ceil((graceUntilMs - now) / DAY_MS)
            : null,
        source,
        isTrial,
    };
}

export async function getProTimeline(): Promise<ProTimeline> {
    try {
        const proUntil = await getSecureItem(PRO_UNTIL_KEY);
        const graceUntil = await getSecureItem(GRACE_UNTIL_KEY);
        const source = await getSecureItem(PRO_SOURCE_KEY);
        return computeTimeline(proUntil, graceUntil, source);
    } catch {
        return computeTimeline(null, null, null);
    }
}

/**
 * Reactive timeline hook for the renew-banner + settings panel. Re-reads
 * the cached dates on demand via `refresh()` (call this after a
 * successful upgrade flow or after syncProAccessFromServer).
 */
export function useProTimeline(): { timeline: ProTimeline; refresh: () => Promise<void> } {
    const [timeline, setTimeline] = useState<ProTimeline>(() =>
        computeTimeline(null, null, null));
    const refresh = useCallback(async () => {
        const t = await getProTimeline();
        setTimeline(t);
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    return { timeline, refresh };
}

/**
 * Pull the canonical subscription state from the server and reconcile
 * local secure-store + IME bridge with it. Called on app launch
 * (after the secure-store hydrate) and on demand from the upgrade
 * screen. Belt-and-suspenders against:
 *   - webhook losses (server's local record may be ahead of ours)
 *   - subscriptions modified by Mission Control's tier override
 *   - device clock skew
 */
export async function syncProAccessFromServer(deviceId: string): Promise<void> {
    // No-op since Piqabu went free. Previously this pulled the server's
    // subscription state and could write a '0' (free) flag — which would
    // re-lock the keyboard bridge. With no consumer tier there's nothing
    // to reconcile; access is always granted (see hasProAccess). Kept as
    // a callable stub so existing call sites don't need to change, and so
    // the Institutional tier can reinstate a real sync later.
    void deviceId;
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
