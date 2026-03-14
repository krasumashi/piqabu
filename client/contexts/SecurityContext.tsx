import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import Constants from 'expo-constants';
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

const isExpoGo = Constants.appOwnership === 'expo';

/* ═══════════════ PROVIDER ══════════════════════ */

export function SecurityProvider({ children }: { children: React.ReactNode }) {
    const [panicEnabled, _setPanicEnabled] = useState(false);
    const [biometricEnabled, _setBiometricEnabled] = useState(false);
    const [panicActive, setPanicActive] = useState(false);
    const [biometricLocked, setBiometricLocked] = useState(false);

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
            // Lock on first load if biometric is enabled (not in Expo Go)
            if (bio === 'true' && Platform.OS !== 'web' && !isExpoGo) {
                setBiometricLocked(true);
            }
        })();
    }, []);

    /* ── Persist preferences ── */
    const setPanicEnabled = useCallback(async (v: boolean) => {
        _setPanicEnabled(v);
        await setSecureItem('piqabu_panic_enabled', v ? 'true' : 'false');
    }, []);

    const setBiometricEnabled = useCallback(async (v: boolean) => {
        if (v && Platform.OS !== 'web') {
            // Biometric requires expo-local-authentication which needs a production build.
            // In Expo Go / dev, show an alert and skip.
            Alert.alert(
                'Production Build Required',
                'Biometric lock requires a production build (expo-local-authentication). It will not work in Expo Go.',
            );
            return;
        }
        _setBiometricEnabled(v);
        await setSecureItem('piqabu_biometric_enabled', v ? 'true' : 'false');
    }, []);

    /* ── Biometric authentication ── */
    // NOTE: expo-local-authentication is removed for Expo Go compatibility.
    // In production builds, re-add the package and restore native auth here.
    const authenticate = useCallback(async (): Promise<boolean> => {
        // Without expo-local-authentication, just unlock directly.
        setBiometricLocked(false);
        return true;
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
    // In __DEV__ mode (Expo Go), shake opens the dev menu instead.
    // Shake-to-panic only works in production; use TEST PANIC button in dev.
    useEffect(() => {
        if (Platform.OS === 'web' || !panicEnabled || __DEV__) return;

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
        if (Platform.OS === 'web' || !biometricEnabled || isExpoGo) return;
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
