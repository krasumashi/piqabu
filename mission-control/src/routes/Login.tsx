import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DEFAULT_API_BASE,
    getApiBase,
    probeAdminKey,
    setAdminKey,
    setApiBase,
} from '../lib/api';
import PulseDot from '../components/PulseDot';

/**
 * Single-input operator login. The "username" is the admin API key —
 * matched server-side against ADMIN_API_KEY env var on Render. Key is
 * stored in sessionStorage (cleared on tab close).
 *
 * Advanced section lets the operator point at a different API base
 * (staging / local) without rebuilding.
 */
export default function Login() {
    const navigate = useNavigate();
    const [key, setKey] = useState('');
    const [base, setBase] = useState(getApiBase());
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            setApiBase(base.trim() || DEFAULT_API_BASE);
            const ok = await probeAdminKey(key.trim());
            if (!ok) {
                setError('Key rejected by server. Check the ADMIN_API_KEY env var on Render.');
                return;
            }
            setAdminKey(key.trim());
            navigate('/pulse', { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Network error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6">
            <form
                onSubmit={onSubmit}
                className="w-full max-w-md flex flex-col gap-6 p-8 border border-edge2 rounded-2xl bg-paper"
            >
                <div className="flex items-center gap-3 mb-2">
                    <PulseDot size={10} />
                    <div className="flex flex-col">
                        <span className="text-ink text-[11px] tracking-widest font-bold">
                            PIQABU TOWER
                        </span>
                        <span className="text-faint text-[9px] tracking-widest">
                            MISSION CONTROL · OPERATOR LOGIN
                        </span>
                    </div>
                </div>

                <label className="flex flex-col gap-2">
                    <span className="text-muted text-[9px] tracking-widest font-bold uppercase">
                        Admin Key
                    </span>
                    <input
                        type="password"
                        value={key}
                        onChange={e => setKey(e.target.value)}
                        autoComplete="current-password"
                        autoFocus
                        placeholder="••••••••••••••••"
                        className="bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-sm tracking-wider focus:outline-none focus:border-ink"
                    />
                </label>

                <button
                    type="button"
                    onClick={() => setShowAdvanced(s => !s)}
                    className="text-faint text-[9px] tracking-widest text-left hover:text-muted"
                >
                    {showAdvanced ? '▾' : '▸'} API ENDPOINT
                </button>

                {showAdvanced && (
                    <label className="flex flex-col gap-2 -mt-2">
                        <input
                            type="url"
                            value={base}
                            onChange={e => setBase(e.target.value)}
                            placeholder={DEFAULT_API_BASE || 'https://piqabu.onrender.com'}
                            className="bg-paper2 border border-edge rounded-lg px-4 py-3 text-ink text-xs tracking-wider focus:outline-none focus:border-ink"
                        />
                        <span className="text-faint text-[9px] tracking-widest">
                            Leave blank for the default. Used for staging / local dev.
                        </span>
                    </label>
                )}

                {error && (
                    <div className="text-bad text-[10px] tracking-wider border border-bad/40 bg-bad/5 px-3 py-2 rounded">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={busy || !key}
                    className="bg-ink text-bg py-3 rounded-lg font-bold tracking-widest text-[11px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pulse transition-colors"
                >
                    {busy ? 'VERIFYING…' : 'ENTER'}
                </button>

                <div className="text-faint text-[9px] tracking-widest text-center mt-2">
                    YOUR SESSION ENDS WHEN YOU CLOSE THIS TAB.
                </div>
            </form>
        </div>
    );
}
