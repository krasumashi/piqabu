/**
 * WalkthroughOverlay
 *
 * Renders the guided tour over the room screen. Activated by the
 * WalkthroughContext. Each step:
 *
 *   1. Measures the target view (e.g. PEEP button) via the context's
 *      measureTarget(name).
 *   2. Draws a four-rectangle "cutout" mask — semi-transparent dark
 *      everywhere EXCEPT the target rect, which stays untouched.
 *   3. Animates a thin pulsing ring around the cutout for emphasis.
 *   4. Below or above the cutout (whichever has more screen room),
 *      shows a card with title + typewriter-animated body text.
 *   5. NEXT advances; SKIP TOUR closes the whole tour.
 *
 * The whole thing sits at zIndex 9990 — above most UI but BELOW
 * LockoutOverlay (10000) and ConsentGate (10001) so those still
 * trump the tour if they fire.
 *
 * Per Piqabu aesthetic: monospace, dashed accents, slow typewriter
 * (28ms/char) so the user actually reads each line. No marketing
 * fluff in the body text — it's terse.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
    Dimensions, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { useWalkthrough, TargetRect, WALKTHROUGH_STEPS } from '../lib/walkthrough/WalkthroughContext';

const SCREEN = Dimensions.get('window');

// Pad the highlighted cutout so the target isn't cropped tight to
// its bounds — visually breathes a little.
const CUTOUT_PAD = 8;
const CUTOUT_RADIUS = 18;

// Card dimensions / margins.
const CARD_MAX_WIDTH = 360;
const CARD_HORIZONTAL_MARGIN = 20;
const CARD_GAP_FROM_TARGET = 18;

// Typewriter cadence. 28 ms per character lands ~36 cps which reads
// brisk-but-comfortable. Slower (40+) feels patronising; faster
// (<20) is panicked.
const TYPEWRITER_INTERVAL_MS = 28;

export default function WalkthroughOverlay() {
    const { active, currentStep, stepIndex, next, skip, measureTarget } = useWalkthrough();
    const insets = useSafeAreaInsets();
    const [rect, setRect] = useState<TargetRect | null>(null);
    const [typedBody, setTypedBody] = useState('');
    const ringPulse = useRef(new Animated.Value(0.6)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;

    // Whenever the step changes, re-measure the new target.
    useEffect(() => {
        if (!active || !currentStep) {
            setRect(null);
            return;
        }
        let cancelled = false;
        // Short delay so any layout-affecting state from the previous
        // step settles before we measure.
        const timeout = setTimeout(async () => {
            const r = await measureTarget(currentStep.target);
            if (!cancelled) setRect(r);
        }, 50);
        return () => { cancelled = true; clearTimeout(timeout); };
    }, [active, currentStep, measureTarget]);

    // Typewriter reset + run on step body change.
    useEffect(() => {
        if (!active || !currentStep) {
            setTypedBody('');
            cardOpacity.setValue(0);
            return;
        }
        const body = currentStep.body;
        setTypedBody('');
        Animated.timing(cardOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();

        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setTypedBody(body.slice(0, i));
            if (i >= body.length) clearInterval(id);
        }, TYPEWRITER_INTERVAL_MS);
        return () => clearInterval(id);
    }, [active, currentStep, cardOpacity]);

    // Continuous pulsing ring around the cutout.
    useEffect(() => {
        if (!active) {
            ringPulse.stopAnimation();
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(ringPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(ringPulse, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [active, ringPulse]);

    if (!active || !currentStep) return null;

    const total = WALKTHROUGH_STEPS.length;
    const isLastStep = stepIndex + 1 >= total;

    // If we can't yet measure the target, fall back to a centred
    // card with no cutout so the user isn't stuck on a dark screen.
    const safeRect = rect ?? {
        x: SCREEN.width / 2 - 60, y: SCREEN.height / 2 - 60,
        width: 120, height: 120,
    };

    const paddedRect = {
        x: Math.max(0, safeRect.x - CUTOUT_PAD),
        y: Math.max(0, safeRect.y - CUTOUT_PAD),
        width: safeRect.width + CUTOUT_PAD * 2,
        height: safeRect.height + CUTOUT_PAD * 2,
    };

    // Decide whether to place the card above or below the target.
    // Auto: pick whichever side has more room. Below preferred when
    // tied since most UI elements sit higher than centre.
    const spaceBelow = SCREEN.height - (paddedRect.y + paddedRect.height) - insets.bottom;
    const spaceAbove = paddedRect.y - insets.top;
    let placement = currentStep.placement || 'auto';
    if (placement === 'auto') {
        placement = spaceBelow >= 160 || spaceBelow >= spaceAbove ? 'below' : 'above';
    }

    const cardLeft = Math.max(
        CARD_HORIZONTAL_MARGIN,
        Math.min(
            SCREEN.width - CARD_MAX_WIDTH - CARD_HORIZONTAL_MARGIN,
            paddedRect.x + paddedRect.width / 2 - CARD_MAX_WIDTH / 2,
        ),
    );

    return (
        <View style={styles.root} pointerEvents="box-none">
            {/* Cutout mask = four dark rectangles surrounding the target. */}
            <Pressable
                onPress={next}
                style={[styles.maskRect, {
                    top: 0, left: 0,
                    width: SCREEN.width,
                    height: paddedRect.y,
                }]}
            />
            <Pressable
                onPress={next}
                style={[styles.maskRect, {
                    top: paddedRect.y,
                    left: 0,
                    width: paddedRect.x,
                    height: paddedRect.height,
                }]}
            />
            <Pressable
                onPress={next}
                style={[styles.maskRect, {
                    top: paddedRect.y,
                    left: paddedRect.x + paddedRect.width,
                    width: SCREEN.width - (paddedRect.x + paddedRect.width),
                    height: paddedRect.height,
                }]}
            />
            <Pressable
                onPress={next}
                style={[styles.maskRect, {
                    top: paddedRect.y + paddedRect.height,
                    left: 0,
                    width: SCREEN.width,
                    height: SCREEN.height - (paddedRect.y + paddedRect.height),
                }]}
            />

            {/* Pulsing ring around the cutout to draw the eye. */}
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.ring,
                    {
                        top: paddedRect.y - 3,
                        left: paddedRect.x - 3,
                        width: paddedRect.width + 6,
                        height: paddedRect.height + 6,
                        borderRadius: CUTOUT_RADIUS + 3,
                        opacity: ringPulse,
                    },
                ]}
            />

            {/* The typewriter card. */}
            <Animated.View
                style={[
                    styles.card,
                    {
                        left: cardLeft,
                        opacity: cardOpacity,
                        ...(placement === 'below'
                            ? { top: paddedRect.y + paddedRect.height + CARD_GAP_FROM_TARGET }
                            : { bottom: SCREEN.height - paddedRect.y + CARD_GAP_FROM_TARGET }),
                    },
                ]}
            >
                <View style={styles.cardHeader}>
                    <Ionicons name="ellipse" size={6} color={THEME.live} />
                    <Text style={styles.cardLabel}>{currentStep.title}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.cardStepCount}>
                        {stepIndex + 1} / {total}
                    </Text>
                </View>
                <Text style={styles.cardBody}>
                    {typedBody}
                    <Text style={styles.caret}>▍</Text>
                </Text>
                <View style={styles.cardActions}>
                    <TouchableOpacity onPress={skip} activeOpacity={0.7}>
                        <Text style={styles.skipText}>SKIP TOUR</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        onPress={next}
                        activeOpacity={0.85}
                        style={styles.nextBtn}
                    >
                        <Text style={styles.nextBtnText}>
                            {isLastStep ? 'GOT IT' : 'NEXT'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9990,
    },
    maskRect: {
        position: 'absolute',
        backgroundColor: 'rgba(6, 7, 9, 0.86)',
    },
    ring: {
        position: 'absolute',
        borderWidth: 1.5,
        borderColor: 'rgba(245, 243, 235, 0.62)',
        borderStyle: 'dashed' as any,
    },
    card: {
        position: 'absolute',
        width: CARD_MAX_WIDTH,
        maxWidth: SCREEN.width - CARD_HORIZONTAL_MARGIN * 2,
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55,
        shadowRadius: 24,
        elevation: 22,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    cardLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.ink,
    },
    cardStepCount: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.4,
        color: THEME.faint,
        fontWeight: '700',
    },
    cardBody: {
        fontFamily: THEME.mono,
        fontSize: 13,
        lineHeight: 19,
        color: THEME.ink,
        letterSpacing: 0.3,
        minHeight: 60,
        marginBottom: 14,
    },
    caret: {
        color: THEME.muted,
        fontWeight: '700',
    },
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    skipText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        color: THEME.faint,
        fontWeight: '800',
        paddingVertical: 8,
        paddingRight: 12,
    },
    nextBtn: {
        backgroundColor: THEME.ink,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 10,
    },
    nextBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
});
