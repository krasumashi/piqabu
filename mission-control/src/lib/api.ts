/**
 * API client for Mission Control.
 *
 * All admin endpoints require an `x-admin-key` header matching the server's
 * `ADMIN_API_KEY` env var. We store the key in sessionStorage (not
 * localStorage) so closing the tab clears it — operator has to log in
 * again. Refresh keeps the session alive within the tab.
 *
 * Base URL strategy:
 *   - Dev: Vite proxy forwards /admin and /api to localhost:3000.
 *   - Prod: same-origin reaches the Vultr Signal Tower through
 *     admin.piqabu.live; VITE_API_BASE remains available for staging.
 */

const KEY_STORAGE = 'piqabu_mc_admin_key';
const BASE_STORAGE = 'piqabu_mc_api_base';

/** Default API base if the user hasn't overridden it. Same-origin in
 *  production (Mission Control is served by the Node server itself, so
 *  /admin/* is reachable as a relative URL); proxied in dev via Vite. */
export const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE || '';

export function getAdminKey(): string | null {
    return sessionStorage.getItem(KEY_STORAGE);
}

export function setAdminKey(key: string): void {
    sessionStorage.setItem(KEY_STORAGE, key);
}

export function clearAdminKey(): void {
    sessionStorage.removeItem(KEY_STORAGE);
}

/** Per-session override of the API base — handy if the operator wants to
 *  point a single tab at staging instead of prod. */
export function getApiBase(): string {
    return sessionStorage.getItem(BASE_STORAGE) ?? DEFAULT_API_BASE;
}

export function setApiBase(base: string): void {
    sessionStorage.setItem(BASE_STORAGE, base);
}

export class ApiError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
        super(message);
    }
}

/** Core fetch wrapper. Adds the admin-key header, throws ApiError on non-2xx. */
export async function apiFetch<T = unknown>(
    path: string,
    init: RequestInit = {},
): Promise<T> {
    const key = getAdminKey();
    if (!key) {
        throw new ApiError(401, null, 'No admin key in session');
    }
    const base = getApiBase();
    const headers = new Headers(init.headers);
    headers.set('x-admin-key', key);
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${base}${path}`, { ...init, headers });
    let body: unknown = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        try { body = await res.json(); } catch { /* noop */ }
    } else {
        try { body = await res.text(); } catch { /* noop */ }
    }
    if (!res.ok) {
        const message = typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new ApiError(res.status, body, message);
    }
    return body as T;
}

/** Probe with the given key to verify it works. Returns true on 2xx, false
 *  on 401, throws on any other error (so the UI can show what went wrong). */
export async function probeAdminKey(key: string): Promise<boolean> {
    const base = getApiBase();
    try {
        const res = await fetch(`${base}/admin/status`, {
            headers: { 'x-admin-key': key },
        });
        if (res.status === 401) return false;
        if (res.ok) return true;
        throw new ApiError(res.status, null, `HTTP ${res.status} during probe`);
    } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(0, null, e instanceof Error ? e.message : String(e));
    }
}
