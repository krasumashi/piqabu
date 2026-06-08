export default function Levers() {
    return (
        <div className="flex flex-col gap-6">
            <header>
                <h1 className="text-ink text-lg tracking-widest font-bold">LEVERS</h1>
                <p className="text-faint text-[10px] tracking-widest mt-1">
                    PHASE 2 · MAINTENANCE TOGGLE, BROADCAST, KILL-SWITCH, TIER OVERRIDE
                </p>
            </header>
            <div className="border border-edge2 rounded-xl p-10 text-center bg-paper2/30">
                <div className="text-muted text-[11px] tracking-widest leading-relaxed max-w-md mx-auto">
                    The operator action panel — maintenance mode, system-wide broadcast, per-device block/unblock/kick, tier override — lands in Phase 2.
                    <br /><br />
                    The /admin endpoints are already live on the server today. Use the existing /admin/index.html dashboard or curl until Phase 2 wires them into this surface.
                </div>
            </div>
        </div>
    );
}
