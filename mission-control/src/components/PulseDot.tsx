import { useEffect, useRef } from 'react';

/**
 * The pulsing identity dot from the Piqabu app, ported to web.
 * Slow opacity oscillation. Sizes default to 8px.
 */
export default function PulseDot({ size = 8, color = '#fff' }: { size?: number; color?: string }) {
    const ref = useRef<HTMLSpanElement | null>(null);
    useEffect(() => {
        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const t = (now - start) / 1400;
            const opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI));
            if (ref.current) ref.current.style.opacity = String(opacity);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);
    return (
        <span
            ref={ref}
            style={{
                display: 'inline-block',
                width: size,
                height: size,
                borderRadius: size / 2,
                background: color,
                boxShadow: `0 0 ${size}px ${color}55`,
            }}
        />
    );
}
