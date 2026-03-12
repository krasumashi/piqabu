import React, { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { THEME } from '../constants/Theme';

/* ─────────────────────────── types ────────────────────────────── */

interface SandTextProps {
    /** The text to display and animate away */
    text: string;
    /** When true, start the dissipation animation */
    trigger: boolean;
    /** Called when animation finishes */
    onComplete?: () => void;
    /** Optional style for the container */
    style?: any;
}

/* ─────────────────────── chunk config ─────────────────────────── */

const CHUNK_SIZE = 4;
const STAGGER_MS = 25;
const ANIM_DURATION = 500;

/* ─────────────── individual animated chunk ────────────────────── */

function SandChunk({
    text,
    index,
    trigger,
    dx,
    dy,
    rot,
}: {
    text: string;
    index: number;
    trigger: boolean;
    dx: number;
    dy: number;
    rot: number;
}) {
    const opacity = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);

    useEffect(() => {
        if (trigger) {
            const delay = index * STAGGER_MS;
            const easing = Easing.out(Easing.quad);
            opacity.value = withDelay(delay, withTiming(0, { duration: ANIM_DURATION, easing }));
            translateX.value = withDelay(delay, withTiming(dx, { duration: ANIM_DURATION, easing }));
            translateY.value = withDelay(delay, withTiming(dy, { duration: ANIM_DURATION, easing }));
            rotate.value = withDelay(delay, withTiming(rot, { duration: ANIM_DURATION, easing }));
            scale.value = withDelay(delay, withTiming(0.4, { duration: ANIM_DURATION, easing }));
        } else {
            // Reset instantly (for re-use)
            opacity.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            rotate.value = 0;
            scale.value = 1;
        }
    }, [trigger]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { rotate: `${rotate.value}deg` },
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.Text style={[styles.chunk, animStyle]}>
            {text}
        </Animated.Text>
    );
}

/* ─────────────────── main SandText component ──────────────────── */

export default function SandText({ text, trigger, onComplete, style }: SandTextProps) {
    // Split text into fixed-size chunks
    const chunks = useMemo(() => {
        if (!text) return [];
        const result: string[] = [];
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            result.push(text.slice(i, i + CHUNK_SIZE));
        }
        return result;
    }, [text]);

    // Pre-compute random drift values per chunk (stable per text)
    const drifts = useMemo(() =>
        chunks.map(() => ({
            dx: 10 + Math.random() * 28,         // rightward drift 10-38px
            dy: -(8 + Math.random() * 22),        // upward drift 8-30px
            rot: (Math.random() - 0.5) * 16,      // rotation -8 to +8 degrees
        })),
    [chunks.length]);

    // Fire onComplete after animation finishes
    useEffect(() => {
        if (trigger && chunks.length > 0 && onComplete) {
            const totalMs = chunks.length * STAGGER_MS + ANIM_DURATION + 100;
            const timer = setTimeout(onComplete, totalMs);
            return () => clearTimeout(timer);
        }
    }, [trigger, chunks.length, onComplete]);

    if (!text || chunks.length === 0) return null;

    return (
        <View style={[styles.container, style]}>
            {chunks.map((chunk, i) => (
                <SandChunk
                    key={`${i}-${chunk}`}
                    text={chunk}
                    index={i}
                    trigger={trigger}
                    dx={drifts[i]?.dx ?? 20}
                    dy={drifts[i]?.dy ?? -15}
                    rot={drifts[i]?.rot ?? 0}
                />
            ))}
        </View>
    );
}

/* ─────────────────────── styles ───────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    chunk: {
        fontFamily: THEME.mono,
        fontSize: 13,
        color: THEME.ink,
        letterSpacing: 0.5,
    },
});
