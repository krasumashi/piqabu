export default function Audit() {
    return (
        <div className="flex flex-col gap-6">
            <header>
                <h1 className="text-ink text-lg tracking-widest font-bold">AUDIT</h1>
                <p className="text-faint text-[10px] tracking-widest mt-1">
                    PHASE 2 · IMMUTABLE LOG OF EVERY OPERATOR ACTION
                </p>
            </header>
            <div className="border border-edge2 rounded-xl p-10 text-center bg-paper2/30">
                <div className="text-muted text-[11px] tracking-widest leading-relaxed max-w-md mx-auto">
                    The audit log is the brand's safety net — every lever pull, every device kick, every tier override, recorded with timestamp + operator + reason.
                    <br /><br />
                    Lands in Phase 2 alongside Levers.
                </div>
            </div>
        </div>
    );
}
