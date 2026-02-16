import React, { useRef, useEffect } from 'react';
import {
    Animated,
    TouchableOpacity,
    StyleSheet,
    type ViewStyle,
} from 'react-native';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const THEME = {
    mono: 'SpaceMono',
    faint: 'rgba(245, 243, 235, 0.38)',
    muted: 'rgba(245, 243, 235, 0.62)',
    live: 'rgba(255, 255, 255, 0.85)',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresencePulseProps {
    partnerPresence: { activity: number; brightness: number } | null;
    onTap: () => void;
    onLongPress: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RING_SIZE = 40;
const BORDER_WIDTH = 2;

/** Map activity 0 → 3000 ms, 1 → 600 ms (pulse duration). */
function pulseDuration(activity: number): number {
    return 3000 - activity * 2400;
}

/** Map brightness 0 → 0.3, 1 → 0.9 */
function brightnessToOpacity(brightness: number): number {
    return 0.3 + brightness * 0.6;
}

/** Border color derived from brightness. */
function ringColor(brightness: number): string {
    const a = brightness * 0.6 + 0.3;
    return `rgba(255, 255, 255, ${a.toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PresencePulse({
    partnerPresence,
    onTap,
    onLongPress,
}: PresencePulseProps) {
    // Animated values
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0.3)).current;
    const glowOpacity = useRef(new Animated.Value(0)).current;

    // Keep a ref to the current breathing animation so we can restart it
    // when the cadence changes.
    const breathingAnim = useRef<Animated.CompositeAnimation | null>(null);
    const prevActivity = useRef<number | null>(null);

    // ------------------------------------------------------------------
    // Breathing / pulse animation
    // ------------------------------------------------------------------
    const startBreathing = (activity: number) => {
        // Stop the previous loop if any.
        breathingAnim.current?.stop();

        const duration = pulseDuration(activity);

        breathingAnim.current = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, {
                    toValue: 1.08,
                    duration: duration / 2,
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 0.92,
                    duration: duration / 2,
                    useNativeDriver: true,
                }),
            ]),
        );

        breathingAnim.current.start();
    };

    // ------------------------------------------------------------------
    // React to partner presence changes
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!partnerPresence) {
            // No partner data — dim static ring.
            breathingAnim.current?.stop();
            breathingAnim.current = null;
            scale.setValue(1);
            Animated.timing(opacity, {
                toValue: 0.2,
                duration: 400,
                useNativeDriver: true,
            }).start();
            prevActivity.current = null;
            return;
        }

        const { activity, brightness } = partnerPresence;

        // Update opacity based on brightness.
        Animated.timing(opacity, {
            toValue: brightnessToOpacity(brightness),
            duration: 500,
            useNativeDriver: true,
        }).start();

        // Restart breathing only when activity changes noticeably.
        const diff = prevActivity.current === null
            ? 1
            : Math.abs(activity - prevActivity.current);

        if (diff > 0.05 || prevActivity.current === null) {
            startBreathing(activity);
            prevActivity.current = activity;
        }
    }, [partnerPresence]);

    // Start a gentle default breathing on mount.
    useEffect(() => {
        if (!partnerPresence) {
            // Dim idle breathing while waiting for data.
            startBreathing(0);
            opacity.setValue(0.2);
        }
        return () => {
            breathingAnim.current?.stop();
        };
    }, []);

    // ------------------------------------------------------------------
    // Long-press glow feedback
    // ------------------------------------------------------------------
    const handleLongPress = () => {
        onLongPress();

        // Brief glow flash.
        Animated.sequence([
            Animated.timing(glowOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }),
        ]).start();
    };

    // ------------------------------------------------------------------
    // Dynamic border color
    // ------------------------------------------------------------------
    const borderColor = partnerPresence
        ? ringColor(partnerPresence.brightness)
        : THEME.faint;

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    return (
        <TouchableOpacity
            onPress={onTap}
            onLongPress={handleLongPress}
            activeOpacity={0.7}
            style={styles.touchable}
        >
            {/* Glow layer (long-press feedback) */}
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.glow,
                    { opacity: glowOpacity },
                ]}
            />

            {/* Main ring */}
            <Animated.View
                style={[
                    styles.ring,
                    {
                        borderColor,
                        opacity,
                        transform: [{ scale }],
                    },
                ]}
            />
        </TouchableOpacity>
    );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
    touchable: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    } as ViewStyle,

    ring: {
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        borderWidth: BORDER_WIDTH,
        borderColor: THEME.faint,
    } as ViewStyle,

    glow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: RING_SIZE / 2,
        backgroundColor: THEME.live,
        opacity: 0,
    } as ViewStyle,
});
