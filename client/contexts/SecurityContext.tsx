import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getSecureItem, setSecureItem } from '../lib/platform/storage';

/* ─────────────────── types ─────────────────── */

interface SecurityContextValue {
    panicEnabled: boolean;
    biometricEnabled: boolean;
    panicActive: boolean;
    biometricLocked: boolean;
    setPanicEnabled: (v: boolean) => Promise<void>;
    setBiometricEnabled: (v: boolean) => Promise<void>;
    triggerPanic: () => void;
    dismissPanic: () => Promise<boolean>;
    authenticate: () => Promise<boolean>;
}

const SecurityContext = createContext<SecurityContextValue>({
    panicEnabled: false,
    biometricEnabled: false,
    panicActive: false,
    biometricLocked: false,
    setPanicEnabled: async () => {},
    setBiometricEnabled: async () => {},
    triggerPanic: () => {},
    dismissPanic: async () => true,
    authenticate: async () => true,
});

export const useSecurity = () => useContext(SecurityContext);

/* ─────────── shake detection constants ─────── */

const SHAKE_THRESHOLD = 1.8; // G-force
const SHAKE_COUNT = 3;       // consecutive readings above threshold
const SHAKE_COOLDOWN = 2000; // ms cooldown after trigger

/* ═══════════════ PROVIDER ══════════════════════ */

export function SecurityProvider({ children }: { children: React.ReactNode }) {
    const [panicEnabled, _setPanicEnabled] = useState(false);
    const [biometricEnabled, _setBiometricEnabled] = useState(false);
    const [panicActive, setPanicActive] = useState(false);
    const [biometricLocked, setBiometricLocked] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const shakeCountRef = useRef(0);
    const cooldownRef = useRef(false);
    const appStateRef = useRef(AppState.currentState);

    /* ── Load preferences from secure storage ── */
    useEffect(() => {
        (async () => {
            const [panic, bio] = await Promise.all([
                getSecureItem('piqabu_panic_enabled'),
                getSecureItem('piqabu_biometric_enabled'),
            ]);
            _setPanicEnabled(panic === 'true');
            _setBiometricEnabled(bio === 'true');
            // Lock on first load if biometric is enabled
            if (bio === 'true' && Platform.OS !== 'web') {
                setBiometricLocked(true);
            }
            setLoaded(true);
        })();
    }, []);

    /* ── Persist preferences ── */
    const setPanicEnabled = useCallback(async (v: boolean) => {
        _setPanicEnabled(v);
        await setSecureItem('piqabu_panic_enabled', v ? 'true' : 'false');
    }, []);

    const setBiometricEnabled = useCallback(async (v: boolean) => {
        if (v && Platform.OS !== 'web') {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();
            if (!compatible || !enrolled) return;
            // Verify with a test authentication
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Verify to enable biometric lock',
                cancelLabel: 'Cancel',
                disableDeviceFallback: false,
            });
            if (!result.success) return;
        }
        _setBiometricEnabled(v);
        await setSecureItem('piqabu_biometric_enabled', v ? 'true' : 'false');
    }, []);

    /* ── Biometric authentication ── */
    const authenticate = useCallback(async (): Promise<boolean> => {
        if (Platform.OS === 'web') {
            setBiometricLocked(false);
            return true;
        }
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Authenticate to access Piqabu',
                cancelLabel: 'Cancel',
                disableDeviceFallback: false,
            });
            if (result.success) {
                setBiometricLocked(false);
                return true;
            }
        } catch {}
        return false;
    }, []);

    /* ── Panic mode ── */
    const triggerPanic = useCallback(() => {
        if (cooldownRef.current) return;
        setPanicActive(true);
        cooldownRef.current = true;
        setTimeout(() => { cooldownRef.current = false; }, SHAKE_COOLDOWN);
    }, []);

    const dismissPanic = useCallback(async (): Promise<boolean> => {
        if (biometricEnabled && Platform.OS !== 'web') {
            const success = await authenticate();
            if (!success) return false;
        }
        setPanicActive(false);
        return true;
    }, [biometricEnabled, authenticate]);

    /* ── Shake detection via Accelerometer ── */
    useEffect(() => {
        if (Platform.OS === 'web' || !panicEnabled) return;

        let sub: { remove: () => void } | null = null;

        (async () => {
            try {
                const { Accelerometer } = await import('expo-sensors');
                Accelerometer.setUpdateInterval(100);
                sub = Accelerometer.addListener(({ x, y, z }) => {
                    const magnitude = Math.sqrt(x * x + y * y + z * z);
                    if (magnitude > SHAKE_THRESHOLD) {
                        shakeCountRef.current += 1;
                        if (shakeCountRef.current >= SHAKE_COUNT) {
                            shakeCountRef.current = 0;
                            triggerPanic();
                        }
                    } else {
                        shakeCountRef.current = 0;
                    }
                });
            } catch {}
        })();

        return () => { sub?.remove(); };
    }, [panicEnabled, triggerPanic]);

    /* ── App state → biometric lock on resume ── */
    useEffect(() => {
        if (Platform.OS === 'web' || !biometricEnabled) return;
        const sub = AppState.addEventListener('change', (nextState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextState === 'active'
            ) {
                setBiometricLocked(true);
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [biometricEnabled]);

    if (!loaded) return null;

    return (
        <SecurityContext.Provider value={{
            panicEnabled,
            biometricEnabled,
            panicActive,
            biometricLocked,
            setPanicEnabled,
            setBiometricEnabled,
            triggerPanic,
            dismissPanic,
            authenticate,
        }}>
            {children}
        </SecurityContext.Provider>
    );
}
