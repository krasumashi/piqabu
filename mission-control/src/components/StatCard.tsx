import { ReactNode } from 'react';

interface Props {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    /** Optional accent — 'ok' (green), 'warn' (amber), 'bad' (red), default neutral. */
    tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-bad',
    neutral: 'text-ink',
};

export default function StatCard({ label, value, sub, tone = 'neutral' }: Props) {
    return (
        <div className="border border-edge2 rounded-xl px-5 py-4 bg-paper2/40 backdrop-blur-sm">
            <div className="text-faint text-[9px] tracking-widest font-bold uppercase mb-2">
                {label}
            </div>
            <div className={`text-3xl font-bold tracking-wider ${toneClass[tone]}`}>
                {value}
            </div>
            {sub && (
                <div className="text-muted text-[10px] tracking-wider mt-1">{sub}</div>
            )}
        </div>
    );
}
