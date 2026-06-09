/**
 * SynthesisIndicator — corner pulse-dot overlay for the deepfake
 * synthesis-probability score on received images.
 *
 * Mounted absolute-positioned over a parent that holds a remote-sourced
 * image (PeepDeck's Reveal view, in Phase 1). Runs the classifier on
 * mount and on imageUri change, then renders one of three states:
 *
 *   - SILENT     — nothing rendered. Most real images.
 *   - FLAGGED    — small pulse-dot in the corner. Tappable for details.
 *   - SUSPICIOUS — brighter pulse-dot, same tap-for-details affordance.
 *
 * Tap expands a small card with:
 *   - The integrated probability (as a percentage).
 *   - Calibrated copy ("This image shows signs of being AI-generated."),
 *     never an absolute claim.
 *   - The engine id, so a returning Pro user knows whether they're
 *     looking at real analysis or the stub (the spec explicitly
 *     requires we say so).
 *
 * No blur, no censor. The user always sees what was sent. Censoring
 * media that we *might* have got wrong would be worse than missing a
 * detection.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import {
    classifyImage,
    classifyBand,
    SynthesisProbability,
    SynthesisBand,
} from '../lib/detection/synthesisDetector';

interface Props {
    imageUri: string | null;
    /** Where to anchor the pulse-dot relative to the parent. */
    placement?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export default function SynthesisIndicator({ imageUri, placement = 'top-right' }: Props) {
    const [result, setResult] = useState<SynthesisProbability | null>(null);
    const [expanded, setExpanded] = useState(false);
    const pulse = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        let alive = true;
        if (!imageUri) { setResult(null); return; }
        (async () => {
            try {
                const r = await classifyImage(imageUri);
                if (alive) setResult(r);
            } catch {
                if (alive) setResult(null);
            }
        })();
        return () => { alive = false; };
    }, [imageUri]);

    useEffect(() => {
        if (!result) return;
        const band = classifyBand(result.score);
        if (band === 'silent') return;
        // Slow pulse so the indicator reads as "alive but not panicked."
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ]),
        ).start();
    }, [result, pulse]);

    if (!result) return null;
    const band = classifyBand(result.score);
    if (band === 'silent') return null;

    return (
        <View style={[styles.anchor, anchorStyle(placement)]} pointerEvents="box-none">
            {/* Dot */}
            <Pressable onPress={() => setExpanded(!expanded)} hitSlop={12}>
                <Animated.View style={[styles.dot, dotStyleForBand(band), { opacity: pulse }]} />
            </Pressable>

            {/* Detail card */}
            {expanded && (
                <View style={[styles.card, cardStyle(placement)]}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="alert-circle-outline" size={14} color={iconColorForBand(band)} />
                        <Text style={[styles.cardLabel, { color: labelColorForBand(band) }]}>
                            {band === 'suspicious' ? 'LIKELY SYNTHETIC' : 'POSSIBLE SYNTHESIS'}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={8}>
                            <Ionicons name="close" size={12} color={THEME.muted} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.cardBody}>
                        This image shows signs of being AI-generated. Detection isn't perfect — use judgment.
                    </Text>
                    <View style={styles.scoreRow}>
                        <Text style={styles.scoreLabel}>CONFIDENCE</Text>
                        <Text style={styles.scoreValue}>
                            {Math.round(result.score * 100)}%
                        </Text>
                    </View>
                    {!result.valid && (
                        <Text style={styles.engineNote}>
                            {result.reason || 'Detector running in placeholder mode.'}
                        </Text>
                    )}
                    <Text style={styles.engineFooter}>
                        engine: {result.engineId}
                    </Text>
                </View>
            )}
        </View>
    );
}

/* ──────────────────────── style helpers ──────────────────────── */

function anchorStyle(placement: Props['placement']) {
    switch (placement) {
        case 'top-left':     return { top: 10, left: 10 };
        case 'bottom-right': return { bottom: 10, right: 10 };
        case 'bottom-left':  return { bottom: 10, left: 10 };
        case 'top-right':
        default:             return { top: 10, right: 10 };
    }
}

function cardStyle(placement: Props['placement']) {
    // Place the card just below the dot, hugging the same edge.
    switch (placement) {
        case 'top-left':     return { top: 22, left: 0 };
        case 'bottom-right': return { bottom: 22, right: 0 };
        case 'bottom-left':  return { bottom: 22, left: 0 };
        case 'top-right':
        default:             return { top: 22, right: 0 };
    }
}

function dotStyleForBand(band: SynthesisBand) {
    if (band === 'suspicious') return { backgroundColor: THEME.warn };
    return { backgroundColor: THEME.muted };
}

function iconColorForBand(band: SynthesisBand) {
    return band === 'suspicious' ? THEME.warn : THEME.muted;
}

function labelColorForBand(band: SynthesisBand) {
    return band === 'suspicious' ? THEME.warn : THEME.muted;
}

const styles = StyleSheet.create({
    anchor: {
        position: 'absolute',
        zIndex: 50,
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 6,
    },
    card: {
        position: 'absolute',
        width: 260,
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 12,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    cardLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '800',
    },
    cardBody: {
        fontFamily: THEME.mono,
        fontSize: 11,
        lineHeight: 16,
        color: THEME.ink,
        marginBottom: 10,
    },
    scoreRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    scoreLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: THEME.faint,
    },
    scoreValue: {
        fontFamily: THEME.mono,
        fontSize: 13,
        color: THEME.ink,
        fontWeight: '900',
    },
    engineNote: {
        fontFamily: THEME.mono,
        fontSize: 9,
        color: THEME.warn,
        marginBottom: 4,
        lineHeight: 12,
    },
    engineFooter: {
        fontFamily: THEME.mono,
        fontSize: 8,
        color: THEME.faint,
        letterSpacing: 1.2,
    },
});
