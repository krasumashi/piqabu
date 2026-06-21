import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';

interface Device {
    deviceId: string;
    tier?: 'free' | 'pro';
    lastSeen?: number | string;
    firstSeen?: number | string;
    blocked?: boolean;
    appBuild?: string;
    [key: string]: unknown;
}

interface DevicesResponse {
    devices?: Device[];
}

/**
 * Searchable + tier-filterable device list. Pure aggregate metadata —
 * no message content, no PII. The operator can search by partial Ghost
 * ID prefix (the first 8 chars are usually what people quote when
 * sending feedback).
 *
 * Click a row → drawer with full device details + live actions
 * (Grant Pro / Set Free, Block / Unblock, Kick) that hit the same
 * /admin/devices/:id endpoints the Levers pane uses — but on THIS
 * device's Ghost ID directly, so no copy-pasting IDs into Levers.
 * The list refreshes after each action.
 */
export default function Devices() {
    const [devices, setDevices] = useState<Device[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'pro'>('all');
    const [selected, setSelected] = useState<Device | null>(null);
    const [lastUpdated, setLastUpdated] = useState(0);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch<DevicesResponse>('/admin/devices');
            setDevices(Array.isArray(res?.devices) ? res.devices : []);
            setLastUpdated(Date.now());
            setErr(null);
            return res?.devices ?? [];
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : String(e));
            return null;
        }
    }, []);

    useEffect(() => {
        void load();
        const id = setInterval(() => { void load(); }, 10_000);
        return () => clearInterval(id);
    }, [load]);

    // Keep the open drawer's device in sync after an action refreshes the list.
    useEffect(() => {
        if (!selected || !devices) return;
        const fresh = devices.find(d => d.deviceId === selected.deviceId);
        if (fresh && fresh !== selected) setSelected(fresh);
    }, [devices, selected]);

    const filtered = useMemo(() => {
        const list = devices ?? [];
        const q = query.trim().toLowerCase();
        return list.filter(d => {
            if (tierFilter !== 'all' && d.tier !== tierFilter) return false;
            if (q && !d.deviceId.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [devices, query, tierFilter]);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-ink text-lg tracking-widest font-bold">DEVICES</h1>
                    <p className="text-faint text-[10px] tracking-widest mt-1">
                        GHOST IDS · NO CONTENT VISIBLE FROM HERE
                    </p>
                </div>
                <div className="text-faint text-[9px] tracking-widest">
                    {lastUpdated ? `${filtered.length} SHOWN · LAST SYNC ${relativeTime(lastUpdated)}` : 'LOADING…'}
                </div>
            </header>

            {err && (
                <div className="text-bad text-[10px] tracking-wider border border-bad/40 bg-bad/5 px-4 py-3 rounded-lg">
                    {err}
                </div>
            )}

            <div className="flex gap-3">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="SEARCH GHOST ID…"
                    className="flex-1 bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink"
                />
                <div className="flex gap-1 bg-paper2 border border-edge rounded-lg p-1">
                    {(['all', 'free', 'pro'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTierFilter(t)}
                            className={`px-3 py-1.5 text-[10px] tracking-widest font-bold rounded ${
                                tierFilter === t ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                            }`}
                        >
                            {t.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="border border-edge2 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-paper2">
                        <tr className="text-faint text-[9px] tracking-widest">
                            <th className="px-4 py-3 font-bold">GHOST ID</th>
                            <th className="px-4 py-3 font-bold">TIER</th>
                            <th className="px-4 py-3 font-bold">LAST SEEN</th>
                            <th className="px-4 py-3 font-bold">FIRST SEEN</th>
                            <th className="px-4 py-3 font-bold">STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-10 text-center text-faint text-[10px] tracking-widest">
                                    {devices === null ? '—' : 'NO DEVICES MATCH THIS FILTER'}
                                </td>
                            </tr>
                        ) : (
                            filtered.map(d => (
                                <tr
                                    key={d.deviceId}
                                    onClick={() => setSelected(d)}
                                    className="border-t border-edge2 hover:bg-paper2/60 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 text-ink text-xs tracking-wider font-bold">
                                        {d.deviceId.slice(0, 16)}…
                                    </td>
                                    <td className="px-4 py-3 text-[10px] tracking-widest">
                                        <span className={d.tier === 'pro' ? 'text-ok' : 'text-muted'}>
                                            {(d.tier ?? 'free').toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted text-[10px] tracking-wider">
                                        {d.lastSeen ? relativeTime(d.lastSeen) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-faint text-[10px] tracking-wider">
                                        {d.firstSeen ? relativeTime(d.firstSeen) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-[10px] tracking-widest">
                                        {d.blocked
                                            ? <span className="text-bad">BLOCKED</span>
                                            : <span className="text-muted">ACTIVE</span>}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selected && (
                <DeviceDrawer device={selected} onClose={() => setSelected(null)} onActed={load} />
            )}
        </div>
    );
}

function DeviceDrawer({ device, onClose, onActed }: { device: Device; onClose: () => void; onActed: () => Promise<unknown> }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

    const isPro = (device.tier ?? 'free') === 'pro';
    const isBlocked = !!device.blocked;

    // Act on THIS device directly — its Ghost ID is already known, so no
    // copy-paste into the Levers pane. Same /admin endpoints Levers uses.
    const act = async (action: string, body: Record<string, unknown> | undefined, busyKey: string) => {
        setBusy(busyKey);
        setMsg(null);
        try {
            const res = await apiFetch<{ message?: string }>(
                `/admin/devices/${device.deviceId}/${action}`,
                { method: 'POST', body: body ? JSON.stringify(body) : undefined },
            );
            setMsg({ tone: 'ok', text: res.message || `${busyKey.toUpperCase()} OK` });
            await onActed();
        } catch (e) {
            setMsg({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-40 flex justify-end bg-black/60"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-paper border-l border-edge p-8 overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="text-faint text-[9px] tracking-widest font-bold mb-2">DEVICE</div>
                        <div className="text-ink text-sm tracking-wider font-bold break-all">
                            {device.deviceId}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-faint hover:text-ink text-lg leading-none"
                    >
                        ×
                    </button>
                </div>

                <dl className="flex flex-col gap-4">
                    <Row label="TIER" value={(device.tier ?? 'free').toUpperCase()} tone={isPro ? 'ok' : 'neutral'} />
                    <Row label="LAST SEEN" value={device.lastSeen ? relativeTime(device.lastSeen) : '—'} />
                    <Row label="FIRST SEEN" value={device.firstSeen ? relativeTime(device.firstSeen) : '—'} />
                    <Row label="APP BUILD" value={device.appBuild ?? '—'} />
                    <Row label="STATUS" value={isBlocked ? 'BLOCKED' : 'ACTIVE'} tone={isBlocked ? 'bad' : 'ok'} />
                </dl>

                <div className="mt-8 pt-6 border-t border-edge2">
                    <div className="text-faint text-[9px] tracking-widest font-bold mb-3">ACTIONS</div>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Tier toggle — show the action that flips current state first. */}
                        {isPro ? (
                            <DrawerBtn label="SET FREE" tone="neutral" busy={busy === 'tier-free'} onClick={() => act('tier', { tier: 'free' }, 'tier-free')} />
                        ) : (
                            <DrawerBtn label="GRANT PRO" tone="ok" busy={busy === 'tier-pro'} onClick={() => act('tier', { tier: 'pro' }, 'tier-pro')} />
                        )}
                        {isBlocked ? (
                            <DrawerBtn label="UNBLOCK" tone="neutral" busy={busy === 'unblock'} onClick={() => act('unblock', undefined, 'unblock')} />
                        ) : (
                            <DrawerBtn label="BLOCK" tone="bad" busy={busy === 'block'} onClick={() => act('block', { reason: 'manual block from Mission Control' }, 'block')} />
                        )}
                        <DrawerBtn label="KICK NOW" tone="warn" busy={busy === 'kick'} onClick={() => act('kick', undefined, 'kick')} />
                    </div>
                    {msg && (
                        <div className={`mt-3 text-[10px] tracking-widest ${msg.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
                            {msg.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DrawerBtn({ label, tone, busy, onClick }: { label: string; tone: 'ok' | 'bad' | 'warn' | 'neutral'; busy: boolean; onClick: () => void }) {
    const toneCls =
        tone === 'ok' ? 'border-ok/40 text-ok hover:bg-ok/10'
        : tone === 'bad' ? 'border-bad/40 text-bad hover:bg-bad/10'
        : tone === 'warn' ? 'border-warn/40 text-warn hover:bg-warn/10'
        : 'border-edge text-muted hover:text-ink hover:bg-paper2';
    return (
        <button
            onClick={onClick}
            disabled={busy}
            className={`px-3 py-2.5 text-[10px] tracking-widest font-bold rounded-lg border bg-transparent transition-colors disabled:opacity-50 ${toneCls}`}
        >
            {busy ? '…' : label}
        </button>
    );
}

function Row({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'ok' | 'bad' | 'neutral' }) {
    const cls = tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-ink';
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-faint text-[9px] tracking-widest font-bold">{label}</dt>
            <dd className={`text-xs tracking-wider ${cls}`}>{value}</dd>
        </div>
    );
}
