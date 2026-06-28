import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime, shortClock } from '../lib/time';

interface Donation {
    reference: string;
    deviceId: string | null;
    amount: number;       // minor units (pesewas)
    currency: string;
    email: string | null;
    at: string;
    thanked: boolean;
    thankMessage: string | null;
    thankSentAt: string | null;
    thankDeliveredAt: string | null;
}

interface DonationsPayload {
    donations: Donation[];
    totals: Record<string, number>;
    count: number;
}

const SYMBOLS: Record<string, string> = { GHS: '₵', NGN: '₦', USD: '$', EUR: '€', GBP: '£' };

function money(minor: number, currency: string): string {
    const sym = SYMBOLS[currency] || `${currency} `;
    const major = (minor || 0) / 100;
    return `${sym}${major.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Donors pane. Piqabu is free; donations are voluntary support. This lists
 * every gift and lets the operator send an in-app thank-you (delivered via
 * the same operator_message banner as helpdesk replies — addressed by the
 * donor's Ghost ID, queued if they're offline).
 */
export default function Donors() {
    const [data, setData] = useState<DonationsPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'unthanked' | 'thanked'>('all');
    const [lastUpdated, setLastUpdated] = useState(0);
    const [active, setActive] = useState<Donation | null>(null);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendStatus, setSendStatus] = useState<'idle' | 'delivered' | 'queued'>('idle');

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const res = await apiFetch<DonationsPayload>('/admin/donations');
                if (!alive) return;
                setData(res);
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

    useEffect(() => {
        setDraft('');
        setSendError(null);
        setSendStatus('idle');
    }, [active?.reference]);

    const donations = data?.donations ?? [];
    const filtered = donations.filter(d => {
        if (filter === 'unthanked') return !d.thanked;
        if (filter === 'thanked') return d.thanked;
        return true;
    });

    const sendThanks = async () => {
        if (!active || !draft.trim() || sending || !active.deviceId) return;
        setSending(true);
        setSendError(null);
        try {
            const res = await apiFetch<{
                success: boolean;
                deliveredImmediately?: boolean;
                queuedForReconnect?: boolean;
            }>(`/admin/donations/${encodeURIComponent(active.reference)}/thank`, {
                method: 'POST',
                body: JSON.stringify({ message: draft.trim() }),
            });
            setSendStatus(res.deliveredImmediately ? 'delivered' : 'queued');
            const updated: Donation = {
                ...active,
                thanked: true,
                thankMessage: draft.trim(),
                thankSentAt: new Date().toISOString(),
                thankDeliveredAt: res.deliveredImmediately ? new Date().toISOString() : null,
            };
            setActive(updated);
            setData(prev => prev ? {
                ...prev,
                donations: prev.donations.map(d => d.reference === updated.reference ? updated : d),
            } : prev);
            setDraft('');
        } catch (e) {
            setSendError(e instanceof ApiError ? e.message : 'Network error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="grid md:grid-cols-[360px_1fr] gap-6 min-h-[60vh]">
            {/* List column */}
            <div className="flex flex-col gap-3">
                <header className="flex items-end justify-between">
                    <div>
                        <h1 className="text-ink text-lg tracking-widest font-bold">DONORS</h1>
                        <p className="text-faint text-[10px] tracking-widest mt-1">
                            {lastUpdated ? `LAST SYNC ${relativeTime(lastUpdated)}` : '—'}
                        </p>
                    </div>
                </header>

                {/* Totals */}
                <div className="border border-edge2 rounded-xl p-4 flex flex-wrap gap-x-6 gap-y-2">
                    <div>
                        <div className="text-faint text-[9px] tracking-widest font-bold">GIFTS</div>
                        <div className="text-ink text-lg tracking-wider font-bold">{data?.count ?? 0}</div>
                    </div>
                    {Object.entries(data?.totals ?? {}).map(([cur, total]) => (
                        <div key={cur}>
                            <div className="text-faint text-[9px] tracking-widest font-bold">RAISED · {cur}</div>
                            <div className="text-ink text-lg tracking-wider font-bold">{money(total, cur)}</div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-1 bg-paper2 border border-edge rounded-lg p-1 self-start">
                    {(['all', 'unthanked', 'thanked'] as const).map(f => (
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
                            {data === null ? '—' : 'NO DONATIONS YET'}
                        </div>
                    ) : (
                        filtered.map(d => (
                            <button
                                key={d.reference}
                                onClick={() => setActive(d)}
                                className={`w-full text-left p-4 hover:bg-paper2/60 transition-colors ${
                                    active?.reference === d.reference ? 'bg-paper2' : ''
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-ink text-sm tracking-wider font-bold">
                                        {money(d.amount, d.currency)}
                                    </span>
                                    <span className="text-faint text-[9px] tracking-widest">
                                        {relativeTime(d.at)}
                                    </span>
                                </div>
                                <div className="text-muted text-[10px] tracking-wider truncate">
                                    {d.deviceId ? `${d.deviceId.slice(0, 14)}…` : 'UNKNOWN DEVICE'}
                                </div>
                                <span className={`inline-block mt-2 text-[8px] tracking-widest font-bold ${d.thanked ? 'text-ok' : 'text-warn'}`}>
                                    {d.thanked ? '✓ THANKED' : '• NOT THANKED'}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Detail column */}
            <div className="border border-edge2 rounded-xl p-8 bg-paper2/30 flex flex-col">
                {active ? (
                    <>
                        <div className="flex items-start justify-between mb-6 gap-3">
                            <div>
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-1">DONATION</div>
                                <div className="text-ink text-2xl tracking-wider font-bold">
                                    {money(active.amount, active.currency)}
                                </div>
                                <div className="text-muted text-[10px] tracking-wider mt-2 break-all">
                                    {active.deviceId || 'UNKNOWN DEVICE'}
                                </div>
                                {active.email && (
                                    <div className="text-faint text-[10px] tracking-wider mt-1 break-all">
                                        {active.email}
                                    </div>
                                )}
                                <div className="text-faint text-[9px] tracking-widest mt-1 break-all">
                                    REF {active.reference}
                                </div>
                            </div>
                            <div className="text-faint text-[9px] tracking-widest text-right">
                                {shortClock(active.at)}
                            </div>
                        </div>

                        {/* Existing thank-you */}
                        {active.thanked && active.thankMessage && (
                            <div className="mb-6 pb-6 border-b border-edge2">
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-2">
                                    THANK-YOU SENT {active.thankSentAt ? shortClock(active.thankSentAt) : ''}
                                    {active.thankDeliveredAt
                                        ? <span className="text-ok"> · DELIVERED</span>
                                        : <span className="text-warn"> · QUEUED FOR RECONNECT</span>}
                                </div>
                                <div className="text-ink text-sm leading-relaxed whitespace-pre-wrap bg-paper2/50 border border-edge2 rounded-lg p-4">
                                    {active.thankMessage}
                                </div>
                            </div>
                        )}

                        {/* Compose */}
                        {active.deviceId ? (
                            <div className="mt-auto">
                                <div className="text-faint text-[9px] tracking-widest font-bold mb-3">
                                    {active.thanked ? 'SEND ANOTHER THANK-YOU' : 'SEND A THANK-YOU'}
                                </div>
                                <textarea
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                    placeholder="The donor sees this as an in-app banner. Keep it warm and brief."
                                    rows={4}
                                    maxLength={4000}
                                    disabled={sending}
                                    className="w-full bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink resize-none disabled:opacity-50"
                                />
                                {sendError && (
                                    <div className="text-bad text-[10px] tracking-wider mt-2">{sendError}</div>
                                )}
                                {sendStatus === 'delivered' && (
                                    <div className="text-ok text-[10px] tracking-widest mt-2">
                                        ✓ DELIVERED · Donor received it in real time
                                    </div>
                                )}
                                {sendStatus === 'queued' && (
                                    <div className="text-warn text-[10px] tracking-widest mt-2">
                                        ⏳ QUEUED · Donor is offline; delivered on next connect
                                    </div>
                                )}
                                <div className="flex justify-between items-center mt-3 gap-3">
                                    <span className="text-faint text-[9px] tracking-widest">{draft.length} / 4000</span>
                                    <button
                                        onClick={sendThanks}
                                        disabled={sending || !draft.trim()}
                                        className="bg-ink text-bg px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pulse transition-colors"
                                    >
                                        {sending ? 'SENDING…' : 'SEND THANK-YOU'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-auto text-faint text-[10px] tracking-widest">
                                NO DEVICE ON RECORD — CANNOT SEND AN IN-APP THANK-YOU FOR THIS GIFT.
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-faint text-[10px] tracking-widest">
                        SELECT A DONATION
                    </div>
                )}
            </div>
        </div>
    );
}
