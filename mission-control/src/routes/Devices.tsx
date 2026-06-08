import { useEffect, useMemo, useState } from 'react';
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
 * Click a row → drawer with full device details + the levers we know
 * about (block/unblock, force-disconnect, tier override). The levers
 * are wired in Phase 2; for now the drawer is read-only.
 */
export default function Devices() {
    const [devices, setDevices] = useState<Device[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'pro'>('all');
    const [selected, setSelected] = useState<Device | null>(null);
    const [lastUpdated, setLastUpdated] = useState(0);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const res = await apiFetch<DevicesResponse>('/admin/devices');
                if (!alive) return;
                setDevices(Array.isArray(res?.devices) ? res.devices : []);
                setLastUpdated(Date.now());
                setErr(null);
            } catch (e) {
                if (!alive) return;
                setErr(e instanceof ApiError ? e.message : String(e));
            }
        };
        tick();
        const id = setInterval(tick, 10_000);
        return () => { alive = false; clearInterval(id); };
    }, []);

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
                <DeviceDrawer device={selected} onClose={() => setSelected(null)} />
            )}
        </div>
    );
}

function DeviceDrawer({ device, onClose }: { device: Device; onClose: () => void }) {
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
                    <Row label="TIER" value={(device.tier ?? 'free').toUpperCase()} />
                    <Row label="LAST SEEN" value={device.lastSeen ? relativeTime(device.lastSeen) : '—'} />
                    <Row label="FIRST SEEN" value={device.firstSeen ? relativeTime(device.firstSeen) : '—'} />
                    <Row label="APP BUILD" value={device.appBuild ?? '—'} />
                    <Row label="STATUS" value={device.blocked ? 'BLOCKED' : 'ACTIVE'} tone={device.blocked ? 'bad' : 'ok'} />
                </dl>

                <div className="mt-8 pt-6 border-t border-edge2">
                    <div className="text-faint text-[9px] tracking-widest font-bold mb-3">ACTIONS</div>
                    <div className="text-muted text-[10px] tracking-wider leading-relaxed">
                        Block / unblock / kick / tier override lever wiring lands in Phase 2 of Mission Control. Today this drawer is read-only — use the existing /admin endpoints directly if you need to act on a device.
                    </div>
                </div>
            </div>
        </div>
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
