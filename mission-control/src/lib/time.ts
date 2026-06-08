/** Relative time formatting for Mission Control — terse, in the brand voice. */

export function relativeTime(input: number | string | Date): string {
    const ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
    if (!Number.isFinite(ts)) return '—';
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.round(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(ts).toISOString().slice(0, 10);
}

export function shortClock(input: number | string | Date): string {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}
