import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

/**
 * MenuRow — Piqabu's segmented-cell list primitive.
 *
 * The visual language adopted from the reference: a row is split into
 * discrete rounded "cells" separated by small gaps, rather than one
 * continuous pill. Anatomy (left → right):
 *
 *   [ accessory ] [ title ......................... ] [ trailing ]
 *      icon glyph     label (+ optional inline value)    chevron / value
 *
 * Monochrome throughout — brightness encodes state. `active` brightens
 * the borders, fills, and glyph (the reference's "selected" look);
 * inactive rows sit faint. Nothing here is structural — it's a drop-in
 * reskin for existing tappable rows: pass the same icon/label/handler.
 *
 * Variants:
 *   tone='danger'  → muted-grey destructive treatment (Leave / Wipe)
 *   value=...      → trailing cell shows state text (ON / LIVE) instead
 *                    of a chevron
 *   disclosure=null→ no trailing cell (pure value-display rows)
 *   onPress absent → renders as a non-interactive View (e.g. CHANNEL KEY)
 */
type Tone = 'default' | 'danger';
type IconName = keyof typeof Ionicons.glyphMap;

interface MenuRowProps {
    label: string;
    icon?: IconName;
    /** Trailing state text (e.g. "ON", "LIVE", "PRO · PAID"). Takes the
     *  trailing cell; when set, the chevron is not shown. */
    value?: string;
    /** Trailing chevron/affordance icon. Defaults to a forward chevron.
     *  Pass null to suppress the trailing cell entirely. */
    disclosure?: IconName | null;
    /** Selected / ON → brighter borders, fills, glyph + ink label. */
    active?: boolean;
    tone?: Tone;
    /** Tint override for the value text (e.g. THEME.live for LIVE). */
    valueColor?: string;
    /** Tint override for the accessory glyph. Breaks the monochrome rule
     *  on purpose for the rare attention-grabbing row (e.g. the red
     *  Support/donate heart). */
    iconColor?: string;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}

export default function MenuRow({
    label,
    icon,
    value,
    disclosure = 'chevron-forward',
    active = false,
    tone = 'default',
    valueColor,
    iconColor,
    onPress,
    style,
}: MenuRowProps) {
    const danger = tone === 'danger';

    const cellBase = [
        styles.cell,
        active && styles.cellActive,
        danger && styles.cellDanger,
    ];
    const glyphColor = iconColor ?? (danger ? THEME.bad : active ? THEME.ink : THEME.muted);
    const labelColor = danger ? THEME.bad : active ? THEME.ink : THEME.muted;

    const body = (
        <View style={[styles.row, style]}>
            {icon && (
                <View style={[cellBase, styles.squareCell]}>
                    <Ionicons name={icon} size={18} color={glyphColor} />
                </View>
            )}

            <View style={[cellBase, styles.titleCell]}>
                <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
                    {label}
                </Text>
            </View>

            {value != null ? (
                <View style={[cellBase, styles.valueCell]}>
                    <Text
                        style={[styles.value, { color: valueColor ?? (active ? THEME.ink : THEME.muted) }]}
                        numberOfLines={1}
                    >
                        {value}
                    </Text>
                </View>
            ) : disclosure ? (
                <View style={[cellBase, styles.squareCell]}>
                    <Ionicons name={disclosure} size={16} color={danger ? THEME.bad : THEME.faint} />
                </View>
            ) : null}
        </View>
    );

    if (!onPress) return body;
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            {body}
        </TouchableOpacity>
    );
}

const CELL_H = 50;
const RADIUS = 15;

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    cell: {
        height: CELL_H,
        borderRadius: RADIUS,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(245,243,235,0.035)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cellActive: {
        borderColor: 'rgba(245,243,235,0.34)',
        backgroundColor: 'rgba(245,243,235,0.09)',
    },
    cellDanger: {
        borderColor: 'rgba(120,120,120,0.40)',
        backgroundColor: 'rgba(120,120,120,0.05)',
    },
    squareCell: {
        width: CELL_H,
    },
    titleCell: {
        flex: 1,
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    valueCell: {
        minWidth: CELL_H,
        paddingHorizontal: 14,
    },
    label: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    value: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
});
