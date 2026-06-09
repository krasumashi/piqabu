/**
 * Insights — operator-side analytics dashboard.
 *
 * Polls /admin/stats every 15 seconds. The endpoint returns aggregations
 * over data the operator already has visibility into (deviceRegistry,
 * subscriptionStore, audit log) plus public GitHub download counts. No
 * client telemetry; no third-party analytics SDK is involved on either
 * side. See server/routes/admin.js (`/stats`) for the field documentation.
 *
 * Layout: three rows of cards + one 30-day chart at the bottom.
 *   Row 1  — Devices    (lifetime, online now, DAU, WAU, MAU)
 *   Row 2  — Pro Tier   (active, in grace, churned 30d)
 *   Row 3  — Revenue + Downloads
 *   Chart  — daily Paystack init vs Pro activations (last 30 days)
 *
 * The chart is rendered with raw <svg> so we don't pull a charting
 * library (recharts ≈ 150 KB gz). It's a small line/bar combo — easy
 * enough to hand-render and matches the spare monochrome aesthetic.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';

interface StatsResponse {
    generatedAt: string;
    devices: {
        lifetime: number;
        onlineNow: number;
        dau: number;
        wau: number;
        mau: number;
        newByDay: Record<string, number>;
    };
    pro: {
        active: number;
        inGrace: number;
        churned30d: number;
    };
    revenue: {
        byCurrency: Record<string, number>; // amount in lowest currency unit
        last30dByDay: Record<string, Record<string, number>>;
    };
    funnel: {
        initialized30d: number;
        activated30d: number;
        initByDay: Record<string, number>;
        activatedByDay: Record<string, number>;
        conversionRate: number | null;
    };
    downloads: {
        totalDownloads: number;
        latestReleaseDownloads: number;
        latestReleaseTag: string | null;
        releases: Array<{ tag: string; name: string; publishedAt: string; downloads: number }>;
    };
}

const POLL_MS = 15_000;

export default function Insights() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const r = await apiFetch<StatsResponse>('/admin/stats');
                if (alive) { setStats(r); setError(null); }
            } catch (e) {
                if (alive) setError(e instanceof ApiError ? e.message : 'Failed to load stats');
            }
        };
        tick();
        const id = setInterval(tick, POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-ink text-lg tracking-widest font-bold">INSIGHTS</h1>
                <p className="text-faint text-[10px] tracking-widest mt-1">
                    AGGREGATED · NO PER-EVENT TRACKING · NO TELEMETRY
                </p>
            </header>

            {error && (
                <div className="text-bad text-[10px] tracking-widest">{error}</div>
            )}

            {!stats ? (
                <div className="text-faint text-[10px] tracking-widest">LOADING…</div>
            ) : (
                <>
                    <Row label="Devices">
                        <Card label="Lifetime" value={stats.devices.lifetime.toLocaleString()} />
                        <Card label="Online now" value={stats.devices.onlineNow.toLocaleString()} accent="live" />
                        <Card label="DAU" sub="24h" value={stats.devices.dau.toLocaleString()} />
                        <Card label="WAU" sub="7d"  value={stats.devices.wau.toLocaleString()} />
                        <Card label="MAU" sub="30d" value={stats.devices.mau.toLocaleString()} />
                    </Row>

                    <Row label="Pro tier">
                        <Card label="Active" value={stats.pro.active.toLocaleString()} accent="ok" />
                        <Card label="In grace" value={stats.pro.inGrace.toLocaleString()} accent="warn" />
                        <Card label="Churned" sub="last 30d" value={stats.pro.churned30d.toLocaleString()} />
                        <Card
                            label="Conversion"
                            sub={`${stats.funnel.activated30d} / ${stats.funnel.initialized30d}`}
                            value={stats.funnel.conversionRate != null
                                ? `${stats.funnel.conversionRate}%`
                                : '—'}
                        />
                    </Row>

                    <Row label="Revenue & distribution">
                        <Card
                            label="Revenue total"
                            value={formatRevenue(stats.revenue.byCurrency)}
                        />
                        <Card
                            label="Revenue 30d"
                            value={formatRevenue(sumLast30(stats.revenue.last30dByDay))}
                        />
                        <Card
                            label="APK downloads"
                            sub={stats.downloads.latestReleaseTag ? `latest: ${stats.downloads.latestReleaseTag} · ${stats.downloads.latestReleaseDownloads.toLocaleString()}` : 'no releases yet'}
                            value={stats.downloads.totalDownloads.toLocaleString()}
                        />
                    </Row>

                    <FunnelChart
                        title="Paystack funnel — last 30 days"
                        initByDay={stats.funnel.initByDay}
                        activatedByDay={stats.funnel.activatedByDay}
                    />
                </>
            )}
        </div>
    );
}

/* ──────────────────────── primitives ──────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase mb-2">{label}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {children}
            </div>
        </section>
    );
}

function Card({
    label, value, sub, accent,
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: 'live' | 'ok' | 'warn';
}) {
    const accentClass = accent === 'live' ? 'text-live'
        : accent === 'ok' ? 'text-ok'
        : accent === 'warn' ? 'text-warn'
        : 'text-ink';
    return (
        <div className="border border-edge2 rounded-xl p-4 bg-paper2/30">
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase">
                {label}
            </div>
            <div className={`text-2xl font-bold tracking-wider mt-2 ${accentClass}`}>
                {value}
            </div>
            {sub && (
                <div className="text-faint text-[9px] tracking-widest mt-1">{sub}</div>
            )}
        </div>
    );
}

/* ──────────────────── revenue formatting ──────────────────── */

// Major-unit divisor per currency. Paystack's lowest unit is the
// minor unit for all currencies we care about (cents/kobo/pesewas).
const DIVISORS: Record<string, number> = { USD: 100, NGN: 100, GHS: 100, EUR: 100, GBP: 100 };
const SYMBOLS: Record<string, string> = { USD: '$', NGN: '₦', GHS: '₵', EUR: '€', GBP: '£' };

function formatAmount(currency: string, minorUnits: number): string {
    const div = DIVISORS[currency] ?? 100;
    const sym = SYMBOLS[currency] ?? `${currency} `;
    const major = minorUnits / div;
    return `${sym}${major.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatRevenue(byCurrency: Record<string, number>): string {
    const entries = Object.entries(byCurrency).filter(([, v]) => v > 0);
    if (entries.length === 0) return '—';
    return entries.map(([cur, amt]) => formatAmount(cur, amt)).join('  ·  ');
}

function sumLast30(byDay: Record<string, Record<string, number>>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const day of Object.values(byDay)) {
        for (const [cur, amt] of Object.entries(day)) {
            out[cur] = (out[cur] || 0) + amt;
        }
    }
    return out;
}

/* ──────────────────── funnel chart ──────────────────── */

function FunnelChart({
    title,
    initByDay,
    activatedByDay,
}: {
    title: string;
    initByDay: Record<string, number>;
    activatedByDay: Record<string, number>;
}) {
    const days = useMemo(() => last30Days(), []);
    const initSeries = days.map(d => initByDay[d] || 0);
    const actSeries  = days.map(d => activatedByDay[d] || 0);
    const max = Math.max(1, ...initSeries, ...actSeries);

    const W = 720, H = 200, P = 24;
    const innerW = W - P * 2;
    const innerH = H - P * 2;
    const stepX = innerW / Math.max(1, days.length - 1);

    const path = (series: number[]) => series
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${P + i * stepX} ${P + innerH - (v / max) * innerH}`)
        .join(' ');

    return (
        <section>
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase mb-2">
                {title}
            </div>
            <div className="border border-edge2 rounded-xl p-4 bg-paper2/30 overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]">
                    {/* baseline */}
                    <line
                        x1={P} y1={P + innerH}
                        x2={W - P} y2={P + innerH}
                        stroke="rgba(245,243,235,0.10)"
                    />
                    {/* faint horizontal grid quarters */}
                    {[0.25, 0.5, 0.75].map(q => (
                        <line
                            key={q}
                            x1={P} y1={P + innerH - innerH * q}
                            x2={W - P} y2={P + innerH - innerH * q}
                            stroke="rgba(245,243,235,0.06)"
                        />
                    ))}
                    {/* init line — faint */}
                    <path d={path(initSeries)} fill="none"
                          stroke="rgba(245,243,235,0.38)" strokeWidth={1.5} />
                    {/* activated line — bright */}
                    <path d={path(actSeries)} fill="none"
                          stroke="rgba(245,243,235,0.92)" strokeWidth={2} />
                    {/* y-axis ticks (max only — keeps it tidy) */}
                    <text x={4} y={P + 6}
                          fill="rgba(245,243,235,0.38)"
                          fontFamily="SpaceMono, monospace"
                          fontSize={9} letterSpacing={1}>
                        {max}
                    </text>
                    {/* first & last day labels */}
                    <text x={P} y={H - 6}
                          fill="rgba(245,243,235,0.38)"
                          fontFamily="SpaceMono, monospace"
                          fontSize={8} letterSpacing={1}>
                        {days[0].slice(5)}
                    </text>
                    <text x={W - P - 30} y={H - 6}
                          fill="rgba(245,243,235,0.38)"
                          fontFamily="SpaceMono, monospace"
                          fontSize={8} letterSpacing={1}>
                        {days[days.length - 1].slice(5)}
                    </text>
                </svg>
                <div className="flex justify-end gap-6 mt-2 text-[9px] tracking-widest">
                    <span className="text-faint flex items-center gap-2">
                        <span className="inline-block w-3 h-px bg-muted" /> INITIATED
                    </span>
                    <span className="text-ink flex items-center gap-2">
                        <span className="inline-block w-3 h-[2px] bg-ink" /> ACTIVATED
                    </span>
                </div>
            </div>
        </section>
    );
}

function last30Days(): string[] {
    const out: string[] = [];
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}
