import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime, shortClock } from '../lib/time';

interface FeedbackReply {
    message: string;
    sentAt: string;
    deliveredAt?: string | null;
    readAt?: string | null;
}

interface FeedbackEntry {
    id: string;
    deviceId: string;
    message: string;
    createdAt: number | string;
    resolved?: boolean;
    reply?: FeedbackReply;
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
    const [replyDraft, setReplyDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendStatus, setSendStatus] = useState<'idle' | 'delivered' | 'queued'>('idle');

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

    // Reset reply state whenever the operator picks a different thread.
    useEffect(() => {
        setReplyDraft('');
        setSendError(null);
        setSendStatus('idle');
    }, [active?.id]);

    const filtered = (entries ?? []).filter(e => {
        if (filter === 'open') return !e.resolved;
        if (filter === 'resolved') return !!e.resolved;
        return true;
    });

    const sendReply = async () => {
        if (!active || !replyDraft.trim() || sending) return;
        setSending(true);
        setSendError(null);
        try {
            const res = await apiFetch<{
                success: boolean;
                deliveredImmediately?: boolean;
                queuedForReconnect?: boolean;
            }>(`/admin/feedback/${active.id}/reply`, {
                method: 'POST',
                body: JSON.stringify({ message: replyDraft.trim() }),
            });
            setSendStatus(res.deliveredImmediately ? 'delivered' : 'queued');
            setReplyDraft('');
            // Optimistically reflect the reply locally so the thread shows it
            // without waiting for the next poll cycle.
            const updated: FeedbackEntry = {
                ...active,
                resolved: true,
                reply: {
                    message: active ? (active.reply?.message ?? '') : '',
                    sentAt: new Date().toISOString(),
                    deliveredAt: res.deliveredImmediately ? new Date().toISOString() : null,
                    readAt: null,
                },
            };
            updated.reply = {
                message: replyDraft.trim(),
                sentAt: new Date().toISOString(),
                deliveredAt: res.deliveredImmediately ? new Date().toISOString() : null,
                readAt: null,
            };
            setActive(updated);
            setEntries(prev => prev?.map(e => e.id === updated.id ? updated : e) ?? null);
        } catch (e) {
            setSendError(e instanceof ApiError ? e.message : 'Network error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="grid md:grid-cols-[360px_1fr] gap-6 min-h-[60vh]">
            {/* Inbox column */}
            <div className="flex flex-col gap-3">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
            <div className="border border-edge2 rounded-xl p-4 sm:p-8 bg-paper2/30 flex flex-col">
                {active ? (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-3">
                            <div>
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-1">
                                    FROM DEVICE
                                </div>
                                <div className="text-ink text-xs tracking-wider font-bold break-all">
                                    {active.deviceId}
                                </div>
                            </div>
                            <div className="text-faint text-[9px] tracking-widest sm:text-right">
                                {shortClock(active.createdAt)}
                            </div>
                        </div>
                        <div className="text-ink text-sm leading-relaxed whitespace-pre-wrap flex-1">
                            {active.message}
                        </div>

                        {/* Existing reply (if one was already sent) */}
                        {active.reply && (
                            <div className="mt-6 pt-6 border-t border-edge2">
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-2">
                                    YOUR REPLY · SENT {shortClock(active.reply.sentAt)}
                                    {active.reply.deliveredAt && (
                                        <span className="text-ok"> · DELIVERED</span>
                                    )}
                                    {!active.reply.deliveredAt && (
                                        <span className="text-warn"> · QUEUED FOR RECONNECT</span>
                                    )}
                                    {active.reply.readAt && (
                                        <span className="text-ok"> · READ</span>
                                    )}
                                </div>
                                <div className="text-ink text-sm leading-relaxed whitespace-pre-wrap bg-paper2/50 border border-edge2 rounded-lg p-4">
                                    {active.reply.message}
                                </div>
                            </div>
                        )}

                        {/* Compose new reply */}
                        <div className="mt-6 pt-6 border-t border-edge2">
                            <div className="text-faint text-[9px] tracking-widest font-bold mb-3">
                                {active.reply ? 'SEND ANOTHER REPLY' : 'WRITE A REPLY'}
                            </div>
                            <textarea
                                value={replyDraft}
                                onChange={e => setReplyDraft(e.target.value)}
                                placeholder="Reply to this device. The user sees it as an in-app banner; tap dismiss closes it."
                                rows={4}
                                maxLength={4000}
                                disabled={sending}
                                className="w-full bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink resize-none disabled:opacity-50"
                            />
                            {sendError && (
                                <div className="text-bad text-[10px] tracking-wider mt-2">
                                    {sendError}
                                </div>
                            )}
                            {sendStatus === 'delivered' && (
                                <div className="text-ok text-[10px] tracking-widest mt-2">
                                    ✓ DELIVERED · Device acknowledged in real time
                                </div>
                            )}
                            {sendStatus === 'queued' && (
                                <div className="text-warn text-[10px] tracking-widest mt-2">
                                    ⏳ QUEUED · Device is offline; delivered on next connect
                                </div>
                            )}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-faint text-[9px] tracking-widest">
                                    {replyDraft.length} / 4000
                                </span>
                                <button
                                    onClick={sendReply}
                                    disabled={sending || !replyDraft.trim()}
                                    className="bg-ink text-bg px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pulse transition-colors"
                                >
                                    {sending ? 'SENDING…' : 'SEND REPLY'}
                                </button>
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
