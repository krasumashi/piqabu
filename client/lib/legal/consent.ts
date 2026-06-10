/**
 * Legal consent helpers.
 *
 * Two flags are persisted in secure-store:
 *   - piqabu_consent_v1 — the version of consent the user has accepted.
 *     Currently 'v1'. Bumping this string forces re-consent (e.g. when
 *     the ToS materially changes).
 *   - piqabu_consent_at — ISO timestamp of acceptance.
 *
 * Versioning lets us legally require re-acceptance after material
 * changes to the Terms without resetting other settings. The gate
 * component checks `getConsentState()` on mount; if the stored
 * version doesn't match CURRENT_CONSENT_VERSION the user sees the
 * gate again with copy about "We've updated our Terms."
 */
import { getSecureItem, setSecureItem } from '../platform/storage';

export const CURRENT_CONSENT_VERSION = 'v1';

const CONSENT_VERSION_KEY = 'piqabu_consent_v1';
const CONSENT_AT_KEY      = 'piqabu_consent_at';

export interface ConsentState {
    accepted: boolean;
    version: string | null;
    acceptedAt: string | null;
    /** True when the user accepted an OLDER version that's now stale. */
    needsReConsent: boolean;
}

export async function getConsentState(): Promise<ConsentState> {
    try {
        const version = await getSecureItem(CONSENT_VERSION_KEY);
        const acceptedAt = await getSecureItem(CONSENT_AT_KEY);
        return {
            accepted: version === CURRENT_CONSENT_VERSION,
            version,
            acceptedAt,
            needsReConsent: !!version && version !== CURRENT_CONSENT_VERSION,
        };
    } catch {
        return { accepted: false, version: null, acceptedAt: null, needsReConsent: false };
    }
}

export async function recordConsent(): Promise<void> {
    const ts = new Date().toISOString();
    try {
        await setSecureItem(CONSENT_VERSION_KEY, CURRENT_CONSENT_VERSION);
        await setSecureItem(CONSENT_AT_KEY, ts);
    } catch { /* noop */ }
}

/* ── URLs ──────────────────────────────────────────────────────────── */

export const LEGAL_URLS = {
    terms:           'https://piqabu.live/terms',
    privacy:         'https://piqabu.live/privacy',
    refunds:         'https://piqabu.live/refunds',
    acceptableUse:   'https://piqabu.live/acceptable-use',
    lawEnforcement:  'https://piqabu.live/law-enforcement',
    transparency:    'https://piqabu.live/transparency',
};
