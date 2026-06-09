/**
 * Update applier — runs the user's chosen update path when they tap
 * UPDATE NOW on either the SOFT update banner or the HARD update wall.
 *
 * Three modes, chosen by the operator when they push the notice from
 * Mission Control:
 *
 *   'live' — JS-only OTA via expo-updates (Updates.fetchUpdateAsync +
 *            reloadAsync). Picks up whatever's on the configured EAS
 *            branch. Doesn't help with native changes (new deps,
 *            manifest edits).
 *
 *   'apk'  — open the operator-supplied URL in the system browser.
 *            For sideloaded APK builds: piqabu.live/download or
 *            wherever the latest APK lives. User installs manually.
 *
 *   'both' — recommended default. Try 'live' first; if there is no
 *            new OTA available (or it errors), fall through to the
 *            APK URL. Operator doesn't have to know which kind of
 *            change shipped.
 *
 * Result shape:
 *   { kind: 'reloaded' }         — applied and the app is restarting
 *   { kind: 'opened-apk' }       — browser opened to the APK page
 *   { kind: 'noop', reason }     — couldn't apply (no update + no URL,
 *                                  or a dev build, etc). Caller should
 *                                  surface this to the user.
 *
 * Safe to call from any RN context. expo-updates is a no-op in
 * Expo Go / web — guard accordingly.
 */
import { Platform, Linking } from 'react-native';
import * as Updates from 'expo-updates';

export interface UpdateNotice {
    id: string;
    mode: 'soft' | 'hard';
    title: string;
    message: string;
    targetVersion: string;
    action: 'live' | 'apk' | 'both';
    apkUrl: string;
    pushedAt: string;
}

type ApplyResult =
    | { kind: 'reloaded' }
    | { kind: 'opened-apk' }
    | { kind: 'noop'; reason: string };

async function tryLiveUpdate(): Promise<boolean> {
    // expo-updates is a stub on web and may be unavailable in dev. The
    // SDK throws if you call into it without a real runtime, so we
    // defensively check first.
    if (Platform.OS === 'web') return false;
    if (!Updates.isEnabled) return false;
    try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return false;
        await Updates.fetchUpdateAsync();
        // reloadAsync hands control back to the new bundle — execution
        // past this point won't run.
        await Updates.reloadAsync();
        return true; // mostly unreachable
    } catch {
        return false;
    }
}

async function openApkUrl(url: string): Promise<boolean> {
    if (!url || !url.trim()) return false;
    try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) return false;
        await Linking.openURL(url);
        return true;
    } catch {
        return false;
    }
}

export async function applyUpdate(notice: UpdateNotice): Promise<ApplyResult> {
    const { action, apkUrl } = notice;

    if (action === 'live') {
        const ok = await tryLiveUpdate();
        if (ok) return { kind: 'reloaded' };
        return { kind: 'noop', reason: 'No new update available right now. Try again shortly.' };
    }

    if (action === 'apk') {
        const ok = await openApkUrl(apkUrl);
        if (ok) return { kind: 'opened-apk' };
        return { kind: 'noop', reason: 'Could not open the download link.' };
    }

    // 'both' — preferred default. Try OTA, fall back to APK URL.
    const live = await tryLiveUpdate();
    if (live) return { kind: 'reloaded' };
    const apk = await openApkUrl(apkUrl);
    if (apk) return { kind: 'opened-apk' };
    return {
        kind: 'noop',
        reason: 'No live update is available and no download link was supplied. Reach out to support.',
    };
}
