/**
 * wipeAllPiqabuState
 *
 * Returns the app to a brand-new install state. Clears:
 *   - Every key we know about in `expo-secure-store`
 *   - Every key in `AsyncStorage`
 *   - The expo file-system cache (uploaded media, scrubbed images, etc)
 *
 * Used by the "Wipe Everything" action in SettingsPanel. Designed for
 * the moment-before-handing-the-phone-away scenario — fast, irreversible,
 * leaves no Piqabu trace behind.
 *
 * On the next launch a fresh Ghost ID is minted, all rooms are gone,
 * onboarding re-runs.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSecureItem } from './platform/storage';

/**
 * Every `expo-secure-store` key Piqabu writes anywhere in the codebase.
 * Keep this in lockstep with any new secure-store writes — we don't have
 * a list-all API in expo-secure-store, so it's an explicit registry.
 */
const KNOWN_SECURE_KEYS = [
    'piqabu_ghost_id',
    'piqabu_onboarded',
    'piqabu_panic_enabled',
    'piqabu_biometric_enabled',
    'piqabu_pro_status',           // set by Phase 3 keyboard bridge
    'piqabu_keyboard_prompt_dismissed',
];

export async function wipeAllPiqabuState(): Promise<void> {
    // 1) Secure store — delete every known key. Failures are tolerated;
    //    we want to get through the list even if one entry is missing.
    await Promise.all(
        KNOWN_SECURE_KEYS.map(async (key) => {
            try { await deleteSecureItem(key); } catch { /* noop */ }
        }),
    );

    // 2) AsyncStorage — clear everything Piqabu has written.
    try { await AsyncStorage.clear(); } catch { /* noop */ }

    // 3) Filesystem cache (best-effort, native only).
    if (Platform.OS !== 'web') {
        try {
            const FileSystem = require('expo-file-system');
            const cacheDir = FileSystem.cacheDirectory;
            if (cacheDir) {
                await FileSystem.deleteAsync(cacheDir, { idempotent: true });
            }
        } catch { /* noop — cache may not exist or be locked */ }
    } else {
        // 3b) Web fallback — also clear localStorage to be belt-and-braces.
        try { localStorage.clear(); } catch { /* noop */ }
    }
}
