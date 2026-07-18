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
    { to: '/donors', label: 'DONORS', phase: 2 },
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
        <div className="min-h-screen min-w-0 flex flex-col overflow-x-hidden">
            <header className="px-4 py-4 sm:px-8 sm:py-5 border-b border-edge2 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                    <PulseDot size={9} />
                    <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
                        <span className="text-ink text-[11px] tracking-widest font-bold">
                            PIQABU TOWER
                        </span>
                        <span className="hidden text-faint text-[9px] tracking-widest sm:inline">
                            · MISSION CONTROL
                        </span>
                    </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="lg:hidden shrink-0 rounded-md border border-edge2 px-3 py-2 text-faint text-[9px] tracking-widest font-bold hover:text-ink transition-colors"
                    >
                        LOG OUT
                    </button>
                </div>

                <nav
                    aria-label="Mission Control sections"
                    className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:justify-center lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
                >
                    {NAV.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `shrink-0 rounded-md border px-3 py-2.5 text-[10px] tracking-widest font-bold transition-colors lg:border-0 lg:px-0 lg:py-0 ${
                                    isActive ? 'border-edge bg-paper2 text-ink' : 'border-edge2 text-muted hover:text-ink'
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
                    className="hidden lg:block text-faint text-[9px] tracking-widest font-bold hover:text-ink transition-colors"
                >
                    LOG OUT
                </button>
            </header>

            <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-8 max-w-[1280px] w-full mx-auto">
                <Outlet />
            </main>

            <footer className="px-4 py-4 sm:px-8 text-[8px] sm:text-[9px] tracking-widest text-faint border-t border-edge2">
                OPERATOR SURFACE · NOT FOR PUBLIC ROUTING · ALL ACTIONS ARE LOGGED
            </footer>
        </div>
    );
}
