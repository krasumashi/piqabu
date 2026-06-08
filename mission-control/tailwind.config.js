// Mission Control theme — mirrors Piqabu's monochrome identity so the
// admin surface visually belongs to the same product family. Single
// source of truth for the palette; keep this in sync with the app's
// constants/Theme.ts.
/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                bg: '#060709',
                paper: '#0F1114',
                paper2: '#0B0D10',
                edge: 'rgba(245, 243, 235, 0.18)',
                edge2: 'rgba(245, 243, 235, 0.10)',
                ink: 'rgba(245, 243, 235, 0.92)',
                muted: 'rgba(245, 243, 235, 0.62)',
                faint: 'rgba(245, 243, 235, 0.38)',
                pulse: '#FFFFFF',
                warn: 'rgba(180, 180, 180, 0.85)',
                bad: 'rgba(220, 80, 80, 0.9)',
                ok: 'rgba(120, 200, 140, 0.85)',
            },
            fontFamily: {
                mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
            },
            letterSpacing: {
                wider: '0.15em',
                widest: '0.25em',
            },
        },
    },
    plugins: [],
};
