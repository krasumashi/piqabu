import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../constants/Theme';
import type { Fingerprint } from '../hooks/usePartnerHandshake';

interface Props {
    value: Fingerprint | null;
    /** When true, render a placeholder row of dots until the value arrives. */
    awaitingLabel?: string;
}

/**
 * The four-glyph mutual fingerprint, rendered in Piqabu's monochrome
 * mono-spaced identity. Big enough that two people can read it to each
 * other over a phone call to verify.
 */
export default function Fingerprint({ value, awaitingLabel = 'COMPUTING…' }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>FINGERPRINT</Text>
            {value ? (
                <View style={styles.row}>
                    {value.map((glyph, i) => (
                        <Text key={i} style={styles.glyph}>{glyph}</Text>
                    ))}
                </View>
            ) : (
                <Text style={styles.awaiting}>{awaitingLabel}</Text>
            )}
            <Text style={styles.hint}>
                Both screens should show the same four shapes.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 6,
    },
    label: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '700',
    },
    row: {
        flexDirection: 'row',
        gap: 14,
        marginTop: 4,
    },
    glyph: {
        fontSize: 28,
        color: THEME.ink,
        fontFamily: THEME.mono,
        lineHeight: 32,
        textAlign: 'center',
        minWidth: 28,
    },
    awaiting: {
        fontFamily: THEME.mono,
        color: THEME.faint,
        fontSize: 10,
        letterSpacing: 2,
        marginTop: 4,
    },
    hint: {
        fontFamily: THEME.mono,
        color: THEME.faint,
        fontSize: 9,
        letterSpacing: 0.8,
        marginTop: 6,
        textAlign: 'center',
    },
});
