/**
 * Theme constants — exact replica of split-sync-chat CSS variables
 * All restyled components import from here instead of NativeWind.
 */

export const THEME = {
    // Backgrounds
    bg: '#060709',
    paper: '#0F1114',
    paper2: '#0B0D10',

    // Borders
    edge: 'rgba(245, 243, 235, 0.18)',
    edge2: 'rgba(245, 243, 235, 0.10)',

    // Text / Ink
    ink: 'rgba(245, 243, 235, 0.92)',
    muted: 'rgba(245, 243, 235, 0.62)',
    faint: 'rgba(245, 243, 235, 0.38)',

    // Accent colors (monochrome — brightness encodes meaning)
    remote: 'rgba(255, 255, 255, 0.70)',
    local: 'rgba(200, 200, 200, 0.60)',
    live: 'rgba(255, 255, 255, 0.85)',
    warn: 'rgba(180, 180, 180, 0.60)',
    bad: 'rgba(120, 120, 120, 0.70)',

    // Accent aliases (monochrome)
    accEmerald: 'rgba(255, 255, 255, 0.85)',
    accSky: 'rgba(255, 255, 255, 0.70)',
    accDanger: 'rgba(120, 120, 120, 0.70)',

    // Border radius
    r: 22,

    // Font family (RN uses fontFamily string)
    mono: 'SpaceMono',
};

// Common reusable style fragments
export const DASHED_BORDER = {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: THEME.edge,
};

export const DASHED_BORDER_FAINT = {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: 'rgba(245, 243, 235, 0.14)',
};

export const LABEL_PENCIL = {
    fontFamily: THEME.mono,
    textTransform: 'uppercase' as const,
    fontWeight: '900' as const,
};

export const CARD_BG = 'rgba(0, 0, 0, 0.10)';

export const SHADOWS = {
    heavy: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.6,
        shadowRadius: 40,
        elevation: 20,
    },
    medium: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 12,
    },
};
