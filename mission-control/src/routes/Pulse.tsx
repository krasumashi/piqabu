import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';
import StatCard from '../components/StatCard';

interface StatusPayload {
    activeRooms: number;
    connectedSockets: number;
    totalDevices?: number;
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    uptime?: number;
    serverTime?: number | string;
    [key: string]: unknown;
}

interface ActiveDevicesPayload {
    devices?: Array<unknown>;
    proCount?: number;
    freeCount?: number;
    [key: string]: unknown;
}

/**
 * Live aggregate stats. Polls /admin/status and /admin/active-devices
 * every 5 seconds. No individual device identifiers shown here — those
 * live in the Devices pane. This is the at-a-glance health/business view.
 */
export default function Pulse() {
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [active, setActive] = useState<ActiveDevicesPayload | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number>(0);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const [s, a] = await Promise.all([
                    apiFetch<StatusPayload>('/admin/status'),
                    apiFetch<ActiveDevicesPayload>('/admin/active-devices').catch(() => ({} as ActiveDevicesPayload)),
                ]);
                if (!alive) return;
                setStatus(s);
                setActive(a);
                setLastUpdated(Date.now());
                setErr(null);
            } catch (e) {
                if (!alive) return;
                setErr(e instanceof ApiError ? e.message : String(e));
            }
        };
        tick();
        const id = setInterval(tick, 5000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    const inMaintenance = status?.maintenanceMode === true;
    const proCount = typeof active?.proCount === 'number' ? active.proCount : null;
    const freeCount = typeof active?.freeCount === 'number' ? active.freeCount : null;

    return (
        <div className="flex flex-col gap-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-ink text-lg tracking-widest font-bold">PULSE</h1>
                    <p className="text-faint text-[10px] tracking-widest mt-1">
                        AT-A-GLANCE NETWORK + BUSINESS HEALTH
                    </p>
                </div>
                <div className="text-faint text-[9px] tracking-widest">
                    {lastUpdated ? `LAST PING ${relativeTime(lastUpdated)}` : 'CONNECTING…'}
                </div>
            </header>

            {err && (
                <div className="text-bad text-[10px] tracking-wider border border-bad/40 bg-bad/5 px-4 py-3 rounded-lg">
                    {err}
                </div>
            )}

            {inMaintenance && (
                <div className="text-warn text-[10px] tracking-widest border border-warn/40 bg-warn/5 px-4 py-3 rounded-lg">
                    ⚠ MAINTENANCE MODE IS ACTIVE
                    {status?.maintenanceMessage && (
                        <span className="block text-[9px] mt-1 text-faint">
                            “{status.maintenanceMessage}”
                        </span>
                    )}
                </div>
            )}

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="Active sessions"
                    value={status?.activeRooms ?? '—'}
                    sub="Live rooms with ≥1 participant"
                />
                <StatCard
                    label="Connected devices"
                    value={status?.connectedSockets ?? '—'}
                    sub="Socket.IO clients online"
                />
                <StatCard
                    label="Pro tier"
                    value={proCount ?? '—'}
                    sub="Currently online with Pro entitlement"
                    tone={proCount && proCount > 0 ? 'ok' : 'neutral'}
                />
                <StatCard
                    label="Free tier"
                    value={freeCount ?? '—'}
                    sub="Currently online without Pro"
                />
            </section>

            <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                    label="Total known devices"
                    value={typeof status?.totalDevices === 'number' ? status.totalDevices : '—'}
                    sub="Lifetime Ghost IDs the server has seen"
                />
                <StatCard
                    label="Server uptime"
                    value={
                        typeof status?.uptime === 'number'
                            ? formatUptime(status.uptime)
                            : '—'
                    }
                    sub="Since last Render deploy"
                />
                <StatCard
                    label="Server time"
                    value={
                        status?.serverTime
                            ? new Date(status.serverTime).toLocaleTimeString(undefined, { hour12: false })
                            : '—'
                    }
                    sub="Render's local clock"
                />
            </section>
        </div>
    );
}

function formatUptime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
}
