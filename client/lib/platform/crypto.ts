import { Platform } from 'react-native';

export function generateUUID(): string {
    if (Platform.OS === 'web') {
        return globalThis.crypto.randomUUID();
    }
    const Crypto = require('expo-crypto');
    return Crypto.randomUUID();
}

export function getRandomBytes(length: number): Uint8Array {
    if (Platform.OS === 'web') {
        const bytes = new Uint8Array(length);
        globalThis.crypto.getRandomValues(bytes);
        return bytes;
    }
    const Crypto = require('expo-crypto');
    return Crypto.getRandomBytes(length);
}

/**
 * Derive a stable Ghost ID for this install.
 *
 * The previous implementation used `generateUUID()` directly, which
 * meant that "Clear Storage" in Android App Info — which wipes
 * SharedPreferences and therefore the expo-secure-store Ghost ID
 * cache — would result in a NEW UUID being minted on the next launch.
 * Mission Control would then see a fresh "first contact" registration
 * for what is, from the user's perspective, the same device.
 *
 * The fix: on Android, derive the Ghost ID deterministically from
 * `Settings.Secure.ANDROID_ID` (exposed by expo-application). On
 * Android 8+, this identifier is:
 *
 *   - Stable across "Clear Storage" / "Clear Data" in App Info.
 *   - Unique per app signing key + per user + per device, so it is
 *     NOT cross-app correlatable (two unrelated apps see different
 *     values for the same physical device).
 *   - Reset on factory reset.
 *   - Reset on uninstall + reinstall.
 *
 * So a returning device after "Clear Storage" gets the SAME Ghost
 * ID (operator sees consistent identity), but uninstall+reinstall
 * or factory reset still mints a fresh one (the user-meaningful
 * "burn this identity" gesture is honored).
 *
 * On iOS and web there is no equivalent — we fall back to a stored
 * random UUID, accepting that the user-meaningful gestures may
 * mint a new identity. iOS doesn't have a "Clear Storage" UX in
 * the same way Android does, so this is mostly a non-issue.
 *
 * Returns null on the rare path where androidId is unavailable; the
 * caller should fall back to `generateUUID()` in that case.
 */
const GHOST_ID_NAMESPACE = 'piqabu-ghost-id-v1';

export async function deriveStableDeviceIdAndroid(): Promise<string | null> {
    if (Platform.OS !== 'android') return null;
    try {
        const Application = require('expo-application');
        const androidId: string | null = typeof Application.getAndroidId === 'function'
            ? Application.getAndroidId()
            : Application.androidId;
        if (!androidId || typeof androidId !== 'string' || androidId.length < 4) {
            return null;
        }
        const Crypto = require('expo-crypto');
        const seed = `${GHOST_ID_NAMESPACE}|${androidId}`;
        // SHA-256 → 64 hex chars. Take first 32 for our UUID payload.
        const digest: string = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            seed,
            { encoding: Crypto.CryptoEncoding.HEX },
        );
        return shapeAsUuidV4(digest);
    } catch {
        return null;
    }
}

/**
 * Format a 32-char hex string as a UUID-shaped string with the v4
 * version bits and the RFC4122 variant bits set. The result still
 * validates against any UUID regex (server's validateDeviceId).
 */
function shapeAsUuidV4(hex: string): string {
    const h = hex.replace(/[^0-9a-f]/gi, '').slice(0, 32).padEnd(32, '0');
    return [
        h.slice(0, 8),
        h.slice(8, 12),
        '4' + h.slice(13, 16),                                                      // version 4
        (((parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16)) + h.slice(17, 20),// variant 10xx
        h.slice(20, 32),
    ].join('-');
}
