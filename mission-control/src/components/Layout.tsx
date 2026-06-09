import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAdminKey } from '../lib/api';
import PulseDot from './PulseDot';

interface NavItem {
    to: string;
    label: string;
    phase: 1 | 2;
}

const NAV: NavItem[] = [
    { to: '/pulse', label: 'PULSE', phase: 1 },
    { to: '/insights', label: 'INSIGHTS', phase: 2 },
    { to: '/devices', label: 'DEVICES', phase: 1 },
    { to: '/helpdesk', label: 'HELPDESK', phase: 1 },
    { to: '/levers', label: 'LEVERS', phase: 2 },
    { to: '/audit', label: 'AUDIT', phase: 2 },
];

/**
 * Persistent shell — top bar with brand mark + nav, content slot below.
 * Lives inside the authenticated routes only; the Login route doesn't use it.
 */
export default function Layout() {
    const navigate = useNavigate();
    const onLogout = () => {
        clearAdminKey();
        navigate('/login', { replace: true });
    };
    return (
        <div className="min-h-screen flex flex-col">
            <header className="px-8 py-5 border-b border-edge2 flex items-center justify-between gap-8">
                <div className="flex items-center gap-3">
                    <PulseDot size={9} />
                    <div className="flex items-baseline gap-3">
                        <span className="text-ink text-[11px] tracking-widest font-bold">
                            PIQABU TOWER
                        </span>
                        <span className="text-faint text-[9px] tracking-widest">
                            · MISSION CONTROL
                        </span>
                    </div>
                </div>

                <nav className="flex items-center gap-5">
                    {NAV.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `text-[10px] tracking-widest font-bold transition-colors ${
                                    isActive ? 'text-ink' : 'text-muted hover:text-ink'
                                }`
                            }
                        >
                            {item.label}
                            {item.phase === 2 && (
                                <span className="ml-1 text-[7px] text-faint">·2</span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <button
                    onClick={onLogout}
                    className="text-faint text-[9px] tracking-widest font-bold hover:text-ink transition-colors"
                >
                    LOG OUT
                </button>
            </header>

            <main className="flex-1 px-8 py-8 max-w-[1280px] w-full mx-auto">
                <Outlet />
            </main>

            <footer className="px-8 py-4 text-[9px] tracking-widest text-faint border-t border-edge2">
                OPERATOR SURFACE · NOT FOR PUBLIC ROUTING · ALL ACTIONS ARE LOGGED
            </footer>
        </div>
    );
}
