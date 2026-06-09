import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';

/**
 * Levers — operator action surface.
 *
 * Maintenance mode, system-wide broadcast, per-device kill switch,
 * tier override. Every action shows an inline confirmation before
 * firing. Surfaces success / failure tersely below each button.
 *
 * No undo for destructive actions (block / kick / wipe). The whole
 * point of the Audit pane is that if you make a mistake here, the log
 * tells you what happened and you can correct manually.
 */
export default function Levers() {
    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-ink text-lg tracking-widest font-bold">LEVERS</h1>
                <p className="text-faint text-[10px] tracking-widest mt-1">
                    MAINTENANCE · BROADCAST · DEVICE CONTROLS
                </p>
            </header>

            <MaintenancePanel />
            <BroadcastPanel />
            <UpdateNoticePanel />
            <DevicePanel />
        </div>
    );
}

/* ─────────────────────────── MAINTENANCE ────────────────────────────── */

function MaintenancePanel() {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

    useEffect(() => {
        let active = true;
        apiFetch<{ maintenanceMode?: boolean; maintenanceMessage?: string }>('/admin/status')
            .then(s => {
                if (!active) return;
                setEnabled(!!s.maintenanceMode);
                if (s.maintenanceMessage) setMessage(s.maintenanceMessage);
            })
            .catch(() => { if (active) setEnabled(false); });
        return () => { active = false; };
    }, []);

    const toggle = async () => {
        setBusy(true);
        setFeedback(null);
        try {
            const next = !enabled;
            await apiFetch('/admin/maintenance', {
                method: 'POST',
                body: JSON.stringify({ enabled: next, message }),
            });
            setEnabled(next);
            setFeedback({ tone: 'ok', text: next ? 'Maintenance ON' : 'Maintenance OFF' });
        } catch (e) {
            setFeedback({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Section
            label="Maintenance mode"
            sub="Stops new connections / blocks new rooms. Existing sessions stay open."
            tone={enabled ? 'warn' : 'neutral'}
        >
            <div className="flex items-center gap-4">
                <div className={`text-2xl font-bold tracking-wider ${enabled ? 'text-warn' : 'text-faint'}`}>
                    {enabled === null ? '—' : enabled ? 'ON' : 'OFF'}
                </div>
                <button
                    onClick={toggle}
                    disabled={busy || enabled === null}
                    className={`px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        enabled
                            ? 'bg-warn/20 text-warn border border-warn/40 hover:bg-warn/30'
                            : 'bg-ink text-bg hover:bg-pulse'
                    }`}
                >
                    {busy ? '…' : enabled ? 'TURN OFF' : 'TURN ON'}
                </button>
            </div>
            <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Optional message shown to users blocked during maintenance"
                rows={2}
                maxLength={500}
                className="w-full mt-4 bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink resize-none"
            />
            {feedback && (
                <div className={`mt-3 text-[10px] tracking-widest ${feedback.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
                    {feedback.text}
                </div>
            )}
        </Section>
    );
}

/* ─────────────────────────── BROADCAST ─────────────────────────────── */

function BroadcastPanel() {
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
    const [confirming, setConfirming] = useState(false);

    const send = async () => {
        const m = message.trim();
        if (!m) return;
        setBusy(true);
        setFeedback(null);
        try {
            const res = await apiFetch<{ message?: string }>('/admin/broadcast', {
                method: 'POST',
                body: JSON.stringify({ message: m }),
            });
            setFeedback({ tone: 'ok', text: res.message || 'Broadcast sent' });
            setMessage('');
            setConfirming(false);
        } catch (e) {
            setFeedback({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Section
            label="Broadcast"
            sub="Push a system message to every connected client right now. Visible until the client dismisses."
        >
            <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setConfirming(false); }}
                placeholder="e.g. Scheduled maintenance at 22:00 UTC — sessions will be paused for ~10 minutes."
                rows={3}
                maxLength={500}
                className="w-full bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink resize-none"
            />
            <div className="flex justify-between items-center mt-3 gap-3">
                <span className="text-faint text-[9px] tracking-widest">
                    {message.length} / 500
                </span>
                {!confirming ? (
                    <button
                        onClick={() => setConfirming(true)}
                        disabled={!message.trim()}
                        className="bg-ink text-bg px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pulse"
                    >
                        SEND TO EVERYONE
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirming(false)}
                            className="px-4 py-2 rounded-lg text-[10px] tracking-widest font-bold text-muted hover:text-ink"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={send}
                            disabled={busy}
                            className="bg-warn text-bg px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {busy ? 'SENDING…' : 'CONFIRM SEND'}
                        </button>
                    </div>
                )}
            </div>
            {feedback && (
                <div className={`mt-3 text-[10px] tracking-widest ${feedback.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
                    {feedback.text}
                </div>
            )}
        </Section>
    );
}

/* ─────────────────────────── UPDATE NOTICE ─────────────────────────── */

interface UpdateNotice {
    id: string;
    mode: 'soft' | 'hard';
    title: string;
    message: string;
    targetVersion: string;
    action: 'live' | 'apk' | 'both';
    apkUrl: string;
    pushedAt: string;
}

function UpdateNoticePanel() {
    const [active, setActive] = useState<UpdateNotice | null | undefined>(undefined);
    const [mode, setMode] = useState<'soft' | 'hard'>('soft');
    const [title, setTitle] = useState('Update available');
    const [message, setMessage] = useState('');
    const [targetVersion, setTargetVersion] = useState('');
    const [action, setAction] = useState<'live' | 'apk' | 'both'>('both');
    // Stable URL — GitHub Releases redirects /latest/download/<filename>
    // to whatever the most recent release's matching asset is, so this
    // never goes stale even as you ship new versions. The release flow
    // (scripts/release-apk.sh) always attaches the APK as piqabu.apk,
    // keeping this URL pointed at the newest build.
    const [apkUrl, setApkUrl] = useState('https://github.com/krasumashi/piqabu/releases/latest/download/piqabu.apk');
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

    useEffect(() => {
        let alive = true;
        apiFetch<{ notice: UpdateNotice | null }>('/admin/update-notice')
            .then(r => { if (alive) setActive(r.notice); })
            .catch(() => { if (alive) setActive(null); });
        return () => { alive = false; };
    }, []);

    const push = async () => {
        const m = message.trim();
        if (!m) return;
        setBusy(true);
        setFeedback(null);
        try {
            const res = await apiFetch<{ notice: UpdateNotice; recipients?: number }>('/admin/update-notice', {
                method: 'POST',
                body: JSON.stringify({ mode, title, message: m, targetVersion, action, apkUrl }),
            });
            setActive(res.notice);
            setConfirming(false);
            setFeedback({
                tone: 'ok',
                text: `Pushed to ${res.recipients ?? 0} live device(s). New connections will pick it up automatically.`,
            });
        } catch (e) {
            setFeedback({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(false);
        }
    };

    const clear = async () => {
        setBusy(true);
        setFeedback(null);
        try {
            await apiFetch('/admin/update-notice', { method: 'DELETE' });
            setActive(null);
            setFeedback({ tone: 'ok', text: 'Active notice cleared. Devices will dismiss the banner/wall.' });
        } catch (e) {
            setFeedback({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(false);
        }
    };

    const showApkField = action !== 'live';

    return (
        <Section
            label="Push update notice"
            sub="Soft = dismissable banner. Hard = full-screen wall, no dismiss. Live = JS-only OTA. APK = open download URL. Both = try OTA, fall back to APK (recommended)."
            tone={active?.mode === 'hard' ? 'warn' : 'neutral'}
        >
            {active === undefined ? (
                <div className="text-faint text-[10px] tracking-widest">LOADING…</div>
            ) : active ? (
                <div className="mb-4 p-3 rounded-lg bg-paper2 border border-edge2">
                    <div className="flex items-center gap-2 mb-2">
                        <div className={`text-[9px] tracking-widest font-bold px-2 py-0.5 rounded ${
                            active.mode === 'hard' ? 'bg-warn/20 text-warn' : 'bg-ink/10 text-ink'
                        }`}>
                            {active.mode.toUpperCase()}
                        </div>
                        <div className="text-faint text-[9px] tracking-widest">
                            {active.action.toUpperCase()} · {active.targetVersion || '—'}
                        </div>
                        <div className="flex-1" />
                        <button
                            onClick={clear}
                            disabled={busy}
                            className="text-[9px] tracking-widest font-bold text-bad hover:text-warn disabled:opacity-40"
                        >
                            CLEAR ACTIVE NOTICE
                        </button>
                    </div>
                    <div className="text-ink text-xs tracking-wider mb-1 font-bold">{active.title || '(no title)'}</div>
                    <div className="text-muted text-[11px] tracking-wider leading-snug">{active.message}</div>
                </div>
            ) : (
                <div className="text-faint text-[10px] tracking-widest mb-4">NO ACTIVE NOTICE</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <ModeToggle
                    label="Mode"
                    options={[
                        { value: 'soft', label: 'SOFT — banner' },
                        { value: 'hard', label: 'HARD — wall' },
                    ]}
                    value={mode}
                    onChange={v => { setMode(v); setConfirming(false); }}
                />
                <ModeToggle
                    label="Action"
                    options={[
                        { value: 'live', label: 'LIVE OTA' },
                        { value: 'apk', label: 'APK URL' },
                        { value: 'both', label: 'BOTH' },
                    ]}
                    value={action}
                    onChange={v => { setAction(v); setConfirming(false); }}
                />
            </div>

            <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); setConfirming(false); }}
                maxLength={120}
                placeholder="Title (shown to user)"
                className="w-full bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink mb-3"
            />

            <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setConfirming(false); }}
                placeholder="What changed. Will appear in the banner / wall body."
                rows={3}
                maxLength={1000}
                className="w-full bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink resize-none mb-3"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                    type="text"
                    value={targetVersion}
                    onChange={e => { setTargetVersion(e.target.value); setConfirming(false); }}
                    maxLength={40}
                    placeholder="Target version (optional, e.g. 1.4.2)"
                    className="bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink"
                />
                {showApkField && (
                    <input
                        type="text"
                        value={apkUrl}
                        onChange={e => { setApkUrl(e.target.value); setConfirming(false); }}
                        maxLength={500}
                        placeholder="APK URL (https://piqabu.live/download)"
                        className="bg-paper2 border border-edge rounded-lg px-3 py-2 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink"
                    />
                )}
            </div>

            <div className="flex justify-between items-center gap-3">
                <span className="text-faint text-[9px] tracking-widest">
                    {message.length} / 1000
                </span>
                {!confirming ? (
                    <button
                        onClick={() => setConfirming(true)}
                        disabled={!message.trim()}
                        className="bg-ink text-bg px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pulse"
                    >
                        PUSH NOTICE
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirming(false)}
                            className="px-4 py-2 rounded-lg text-[10px] tracking-widest font-bold text-muted hover:text-ink"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={push}
                            disabled={busy}
                            className={`px-5 py-2 rounded-lg text-[10px] tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                                mode === 'hard' ? 'bg-warn text-bg' : 'bg-ink text-bg'
                            }`}
                        >
                            {busy ? 'PUSHING…' : mode === 'hard' ? 'CONFIRM HARD PUSH' : 'CONFIRM SOFT PUSH'}
                        </button>
                    </div>
                )}
            </div>

            {feedback && (
                <div className={`mt-3 text-[10px] tracking-widest ${feedback.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
                    {feedback.text}
                </div>
            )}
        </Section>
    );
}

function ModeToggle<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div>
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase mb-1.5">{label}</div>
            <div className="flex gap-1 bg-paper2 border border-edge rounded-lg p-1">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 px-3 py-1.5 rounded text-[10px] tracking-widest font-bold transition-colors ${
                            value === opt.value
                                ? 'bg-ink text-bg'
                                : 'text-muted hover:text-ink'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────── DEVICE CONTROLS ───────────────────────── */

function DevicePanel() {
    const [deviceId, setDeviceId] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

    const act = async (
        action: string,
        method: 'POST',
        body?: Record<string, unknown>,
        busyKey?: string,
    ) => {
        const id = deviceId.trim();
        if (!id) return;
        // busyKey lets two buttons that hit the same endpoint (SET PRO
        // and SET FREE both POST /tier) track their spinners independently.
        setBusy(busyKey || action);
        setFeedback(null);
        try {
            const res = await apiFetch<{ message?: string; success?: boolean }>(
                `/admin/devices/${id}/${action}`,
                { method, body: body ? JSON.stringify(body) : undefined },
            );
            const label = (busyKey || action).toUpperCase();
            setFeedback({ tone: 'ok', text: res.message || `${label} OK` });
        } catch (e) {
            setFeedback({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Failed' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <Section
            label="Device controls"
            sub="Find a Ghost ID (use the Devices pane to look it up) and act on it. Blocks survive restarts; kicks are one-shot."
        >
            <input
                type="text"
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                placeholder="Paste a full Ghost ID (UUID)"
                className="w-full bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-xs tracking-wider placeholder:text-faint focus:outline-none focus:border-ink"
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
                <ActionButton
                    onClick={() => act('block', 'POST', { reason: 'manual block from Mission Control' })}
                    label="BLOCK"
                    tone="bad"
                    busy={busy === 'block'}
                    disabled={!deviceId.trim()}
                />
                <ActionButton
                    onClick={() => act('unblock', 'POST')}
                    label="UNBLOCK"
                    tone="neutral"
                    busy={busy === 'unblock'}
                    disabled={!deviceId.trim()}
                />
                <ActionButton
                    onClick={() => act('kick', 'POST')}
                    label="KICK NOW"
                    tone="warn"
                    busy={busy === 'kick'}
                    disabled={!deviceId.trim()}
                />
                <ActionButton
                    onClick={() => act('tier', 'POST', { tier: 'pro' }, 'tier-pro')}
                    label="SET PRO"
                    tone="ok"
                    busy={busy === 'tier-pro'}
                    disabled={!deviceId.trim()}
                />
                <ActionButton
                    onClick={() => act('tier', 'POST', { tier: 'free' }, 'tier-free')}
                    label="SET FREE"
                    tone="neutral"
                    busy={busy === 'tier-free'}
                    disabled={!deviceId.trim()}
                />
            </div>
            {feedback && (
                <div className={`mt-3 text-[10px] tracking-widest ${feedback.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>
                    {feedback.text}
                </div>
            )}
        </Section>
    );
}

/* ─────────────────────────── PRIMITIVES ───────────────────────────── */

function Section({
    label,
    sub,
    children,
    tone = 'neutral',
}: {
    label: string;
    sub: string;
    children: React.ReactNode;
    tone?: 'neutral' | 'warn';
}) {
    const accent = tone === 'warn' ? 'border-warn/40' : 'border-edge2';
    return (
        <div className={`border ${accent} rounded-xl p-6 bg-paper2/30`}>
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase mb-1">
                {label}
            </div>
            <div className="text-muted text-[10px] tracking-wider leading-snug mb-5 max-w-xl">
                {sub}
            </div>
            {children}
        </div>
    );
}

function ActionButton({
    label,
    onClick,
    busy,
    disabled,
    tone,
}: {
    label: string;
    onClick: () => void;
    busy: boolean;
    disabled: boolean;
    tone: 'ok' | 'warn' | 'bad' | 'neutral';
}) {
    const colorClass = {
        ok: 'bg-ok/15 text-ok border-ok/40 hover:bg-ok/25',
        warn: 'bg-warn/15 text-warn border-warn/40 hover:bg-warn/25',
        bad: 'bg-bad/15 text-bad border-bad/40 hover:bg-bad/25',
        neutral: 'bg-paper2 text-muted border-edge hover:bg-paper hover:text-ink',
    }[tone];
    return (
        <button
            onClick={onClick}
            disabled={busy || disabled}
            className={`px-4 py-2 rounded-lg text-[10px] tracking-widest font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colorClass}`}
        >
            {busy ? '…' : label}
        </button>
    );
}
