import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getSecureItem, setSecureItem } from '../lib/platform/storage';

// Marker written whenever the app opens a native picker / permission
// dialog (camera, mic, media). Android can kill+relaunch the app on a
// permission grant; useRoomManager only restores the open channels if
// this marker is fresh — so an intentional swipe-close + reopen starts
// clean, but a permission restart mid-session recovers.
export const PERM_RESTART_KEY = 'piqabu_perm_restart';

/* ─────────────────── types ─────────────────── */

interface SecurityContextValue {
    panicEnabled: boolean;
    biometricEnabled: boolean;
    panicActive: boolean;
    biometricLocked: boolean;
    screenShareActive: boolean;
    setPanicEnabled: (v: boolean) => Promise<void>;
    setBiometricEnabled: (v: boolean) => Promise<void>;
    setScreenShareActive: (v: boolean) => void;
    setFilePickerActive: (v: boolean) => void;
    triggerPanic: () => void;
    dismissPanic: () => Promise<boolean>;
    authenticate: () => Promise<boolean>;
}

const SecurityContext = createContext<SecurityContextValue>({
    panicEnabled: false,
    biometricEnabled: false,
    panicActive: false,
    biometricLocked: false,
    screenShareActive: false,
    setPanicEnabled: async () => {},
    setBiometricEnabled: async () => {},
    setScreenShareActive: () => {},
    setFilePickerActive: () => {},
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
    const [screenShareActive, setScreenShareActive] = useState(false);
    const [filePickerActive, setFilePickerActive] = useState(false);

    // Wrap the picker-active setter so opening a picker/permission dialog
    // also stamps the restart marker (consumed by useRoomManager).
    const markFilePickerActive = useCallback((v: boolean) => {
        setFilePickerActive(v);
        if (v) {
            AsyncStorage.setItem(PERM_RESTART_KEY, String(Date.now())).catch(() => {});
        }
    }, []);

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
                try {
                    const LocalAuth = require('expo-local-authentication');
                    const hasHardware = await LocalAuth.hasHardwareAsync();
                    const isEnrolled = await LocalAuth.isEnrolledAsync();
                    if (hasHardware && isEnrolled) {
                        setBiometricLocked(true);
                    }
                } catch {}
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
            if (isExpoGo) {
                Alert.alert(
                    'Production Build Required',
                    'Biometric lock requires the production build (APK). Use the installed APK on your phone.',
                );
                return;
            }
            // Check hardware support
            try {
                const LocalAuth = require('expo-local-authentication');
                const compatible = await LocalAuth.hasHardwareAsync();
                if (!compatible) {
                    Alert.alert('Not Available', 'This device does not support biometric authentication.');
                    return;
                }
            } catch {
                Alert.alert('Not Available', 'Biometric authentication is unavailable.');
                return;
            }
        }
        _setBiometricEnabled(v);
        await setSecureItem('piqabu_biometric_enabled', v ? 'true' : 'false');
    }, []);

    /* ── Biometric authentication ── */
    const authenticate = useCallback(async (): Promise<boolean> => {
        if (isExpoGo) {
            // Expo Go: no native module, just unlock
            setBiometricLocked(false);
            return true;
        }
        try {
            const LocalAuth = require('expo-local-authentication');
            const result = await LocalAuth.authenticateAsync({
                promptMessage: 'Unlock Piqabu',
                fallbackLabel: 'Use PIN',
            });
            if (result.success) {
                setBiometricLocked(false);
                return true;
            }
            return false;
        } catch {
            // Fallback: unlock if auth unavailable
            setBiometricLocked(false);
            return true;
        }
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
        const sub = AppState.addEventListener('change', async (nextState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextState === 'active' &&
                !screenShareActive && // Skip biometric lock during active screen share
                !filePickerActive     // Skip biometric lock during OS file picker overlay
            ) {
                try {
                    const LocalAuth = require('expo-local-authentication');
                    const hasHardware = await LocalAuth.hasHardwareAsync();
                    const isEnrolled = await LocalAuth.isEnrolledAsync();
                    if (hasHardware && isEnrolled) {
                        setBiometricLocked(true);
                    }
                } catch {}
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [biometricEnabled, screenShareActive, filePickerActive]);

    return (
        <SecurityContext.Provider value={{
            panicEnabled,
            biometricEnabled,
            panicActive,
            biometricLocked,
            screenShareActive,
            setPanicEnabled,
            setBiometricEnabled,
            setScreenShareActive,
            setFilePickerActive: markFilePickerActive,
            triggerPanic,
            dismissPanic,
            authenticate,
        }}>
            {children}
        </SecurityContext.Provider>
    );
}
