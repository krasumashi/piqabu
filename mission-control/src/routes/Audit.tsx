import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime, shortClock } from '../lib/time';

interface LogEntry {
    id: string;
    type: 'info' | 'warn' | 'error';
    message: string;
    meta?: Record<string, unknown>;
    timestamp: string;
}

interface LogsPayload {
    logs?: LogEntry[];
}

/**
 * Audit — chronological log of operator actions + system events.
 *
 * Reads from /admin/logs (existing endpoint). The server records every
 * meaningful event via adminStore.addLog: feedback received, replies
 * sent, blocks/unblocks, kicks, tier overrides, broadcasts, maintenance
 * toggles. Most recent 500 entries are kept on disk (admin.json).
 *
 * No mutation from this pane — by design. The whole point of an audit
 * log is that it's append-only and reviewable, not editable.
 */
export default function Audit() {
    const [logs, setLogs] = useState<LogEntry[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
    const [lastUpdated, setLastUpdated] = useState(0);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const res = await apiFetch<LogsPayload>('/admin/logs');
                if (!alive) return;
                setLogs(Array.isArray(res.logs) ? res.logs : []);
                setLastUpdated(Date.now());
                setErr(null);
            } catch (e) {
                if (!alive) return;
                setErr(e instanceof ApiError ? e.message : String(e));
            }
        };
        tick();
        const id = setInterval(tick, 15_000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    const filtered = (logs ?? []).filter(l => filter === 'all' || l.type === filter);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-ink text-lg tracking-widest font-bold">AUDIT</h1>
                    <p className="text-faint text-[10px] tracking-widest mt-1">
                        APPEND-ONLY LOG · LAST 500 ENTRIES
                    </p>
                </div>
                <div className="text-faint text-[9px] tracking-widest sm:text-right">
                    {lastUpdated ? `${filtered.length} SHOWN · LAST SYNC ${relativeTime(lastUpdated)}` : 'LOADING…'}
                </div>
            </header>

            {err && (
                <div className="text-bad text-[10px] tracking-wider border border-bad/40 bg-bad/5 px-4 py-3 rounded-lg">
                    {err}
                </div>
            )}

            <div className="flex max-w-full gap-1 overflow-x-auto bg-paper2 border border-edge rounded-lg p-1 self-start">
                {(['all', 'info', 'warn', 'error'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`shrink-0 px-3 py-1.5 text-[10px] tracking-widest font-bold rounded ${
                            filter === f ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                        }`}
                    >
                        {f.toUpperCase()}
                    </button>
                ))}
            </div>

            <div className="border border-edge2 rounded-xl overflow-x-auto">
                {filtered.length === 0 ? (
                    <div className="p-10 text-center text-faint text-[10px] tracking-widest">
                        {logs === null ? '—' : 'NO ENTRIES MATCH THIS FILTER'}
                    </div>
                ) : (
                    <table className="w-full min-w-[760px] text-left">
                        <thead className="bg-paper2">
                            <tr className="text-faint text-[9px] tracking-widest">
                                <th className="px-4 py-3 font-bold w-24">TYPE</th>
                                <th className="px-4 py-3 font-bold">MESSAGE</th>
                                <th className="px-4 py-3 font-bold w-32">META</th>
                                <th className="px-4 py-3 font-bold w-40">WHEN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(l => (
                                <tr key={l.id} className="border-t border-edge2 hover:bg-paper2/60 transition-colors">
                                    <td className="px-4 py-3">
                                        <TypeBadge type={l.type} />
                                    </td>
                                    <td className="px-4 py-3 text-ink text-[11px] tracking-wider">
                                        {l.message}
                                    </td>
                                    <td className="px-4 py-3 text-faint text-[9px] tracking-wider font-mono">
                                        {l.meta && Object.keys(l.meta).length > 0
                                            ? formatMeta(l.meta)
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-muted text-[10px] tracking-wider">
                                        {shortClock(l.timestamp)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function TypeBadge({ type }: { type: LogEntry['type'] }) {
    const tone = type === 'error' ? 'text-bad bg-bad/10 border-bad/40'
        : type === 'warn' ? 'text-warn bg-warn/10 border-warn/40'
        : 'text-muted bg-paper2 border-edge2';
    return (
        <span className={`inline-block px-2 py-0.5 rounded border text-[8px] tracking-widest font-bold ${tone}`}>
            {type.toUpperCase()}
        </span>
    );
}

/** Format meta compactly — typically {deviceId, roomId, etc.}. */
function formatMeta(meta: Record<string, unknown>): string {
    return Object.entries(meta)
        .map(([k, v]) => {
            const str = typeof v === 'string' ? v : JSON.stringify(v);
            const short = str.length > 24 ? str.slice(0, 24) + '…' : str;
            return `${k}=${short}`;
        })
        .join(' · ');
}
