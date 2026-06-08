import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime, shortClock } from '../lib/time';

interface FeedbackEntry {
    id: string;
    deviceId: string;
    message: string;
    createdAt: number | string;
    resolved?: boolean;
    [key: string]: unknown;
}

interface FeedbackPayload {
    feedback?: FeedbackEntry[];
    logs?: FeedbackEntry[];
}

/**
 * Read-only helpdesk for Phase 1. Pulls /admin/logs which contains the
 * feedback messages users have submitted via the in-app "REPORT ISSUE
 * / FEEDBACK" flow. The reply-from-dashboard mechanic lands in Phase 2,
 * once we've added an inbound channel to the app (a notification or an
 * in-room banner the operator can push).
 */
export default function Helpdesk() {
    const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
    const [lastUpdated, setLastUpdated] = useState(0);
    const [active, setActive] = useState<FeedbackEntry | null>(null);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const res = await apiFetch<FeedbackPayload>('/admin/logs');
                if (!alive) return;
                const list = res.feedback ?? res.logs ?? [];
                setEntries(list);
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

    const filtered = (entries ?? []).filter(e => {
        if (filter === 'open') return !e.resolved;
        if (filter === 'resolved') return !!e.resolved;
        return true;
    });

    return (
        <div className="grid md:grid-cols-[360px_1fr] gap-6 min-h-[60vh]">
            {/* Inbox column */}
            <div className="flex flex-col gap-3">
                <header className="flex items-end justify-between">
                    <div>
                        <h1 className="text-ink text-lg tracking-widest font-bold">HELPDESK</h1>
                        <p className="text-faint text-[10px] tracking-widest mt-1">
                            {lastUpdated ? `LAST SYNC ${relativeTime(lastUpdated)}` : '—'}
                        </p>
                    </div>
                </header>

                <div className="flex gap-1 bg-paper2 border border-edge rounded-lg p-1 self-start">
                    {(['open', 'resolved', 'all'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-[10px] tracking-widest font-bold rounded ${
                                filter === f ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                            }`}
                        >
                            {f.toUpperCase()}
                        </button>
                    ))}
                </div>

                {err && (
                    <div className="text-bad text-[10px] tracking-wider border border-bad/40 bg-bad/5 px-3 py-2 rounded-lg">
                        {err}
                    </div>
                )}

                <div className="border border-edge2 rounded-xl overflow-hidden divide-y divide-edge2">
                    {filtered.length === 0 ? (
                        <div className="p-8 text-center text-faint text-[10px] tracking-widest">
                            {entries === null ? '—' : 'INBOX IS EMPTY'}
                        </div>
                    ) : (
                        filtered.map(e => (
                            <button
                                key={e.id}
                                onClick={() => setActive(e)}
                                className={`w-full text-left p-4 hover:bg-paper2/60 transition-colors ${
                                    active?.id === e.id ? 'bg-paper2' : ''
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-ink text-[10px] tracking-wider font-bold truncate">
                                        {e.deviceId.slice(0, 12)}…
                                    </span>
                                    <span className="text-faint text-[9px] tracking-widest">
                                        {relativeTime(e.createdAt)}
                                    </span>
                                </div>
                                <p className="text-muted text-[10px] tracking-wider leading-snug line-clamp-2">
                                    {e.message}
                                </p>
                                {e.resolved && (
                                    <span className="inline-block mt-2 text-ok text-[8px] tracking-widest font-bold">
                                        ✓ RESOLVED
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Thread column */}
            <div className="border border-edge2 rounded-xl p-8 bg-paper2/30 flex flex-col">
                {active ? (
                    <>
                        <div className="flex items-start justify-between mb-6 gap-3">
                            <div>
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-1">
                                    FROM DEVICE
                                </div>
                                <div className="text-ink text-xs tracking-wider font-bold break-all">
                                    {active.deviceId}
                                </div>
                            </div>
                            <div className="text-faint text-[9px] tracking-widest text-right">
                                {shortClock(active.createdAt)}
                            </div>
                        </div>
                        <div className="text-ink text-sm leading-relaxed whitespace-pre-wrap flex-1">
                            {active.message}
                        </div>
                        <div className="mt-6 pt-6 border-t border-edge2">
                            <div className="text-faint text-[10px] tracking-widest leading-relaxed">
                                Phase 1 is read-only. Reply UI lands in Phase 2, paired with an in-app inbound channel so messages reach the user inside Piqabu. For now, take notes and respond out-of-band.
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-faint text-[10px] tracking-widest">
                        SELECT A MESSAGE FROM THE INBOX
                    </div>
                )}
            </div>
        </div>
    );
}
