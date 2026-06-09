/**
 * LockoutOverlay
 *
 * Full-screen, undismissable overlay that takes over the entire UI
 * when the device is either:
 *
 *   - blocked     — operator has blocked this specific Ghost ID
 *   - maintenance — server-wide maintenance mode is on
 *
 * The point is to make the lockout immediate AND survive the user
 * killing the app and reopening it. The state is mirrored to
 * secure-store by useSocketManager; we render the cached value on
 * cold start before the socket has even connected, then the server's
 * authoritative push on connect either confirms or clears it.
 *
 * Design notes:
 *   - High zIndex (10000) sits above every other surface including
 *     OperatorBanner and SystemBanner. Lockout wins, always.
 *   - pointerEvents=auto with no dismiss control — there is no escape
 *     hatch by design. Operator releases it via Mission Control, or
 *     the server restarts (transient state).
 *   - Translucent — slightly see-through so the user understands the
 *     app is still alive behind it, but unreachable. Matches the
 *     user's described UX ("translucent screen triggers and a message
 *     shows up").
 *   - Block reason and maintenance message are both surfaced so the
 *     user knows WHY. If empty, we fall back to neutral copy.
 *
 *   - Maintenance vs block precedence: if both are active, the
 *     personal block wins. Maintenance is a system message; a block is
 *     specifically about you, and surfacing the personal context is
 *     more useful.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface Props {
    maintenanceMode: boolean;
    maintenanceMessage: string;
    blocked: boolean;
    blockReason: string;
}

export default function LockoutOverlay({
    maintenanceMode,
    maintenanceMessage,
    blocked,
    blockReason,
}: Props) {
    const opacity = useRef(new Animated.Value(0)).current;
    const visible = blocked || maintenanceMode;

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: visible ? 220 : 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [visible]);

    if (!visible) return null;

    // Personal block takes precedence over system maintenance.
    const isBlock = blocked;

    const title = isBlock ? 'YOU’VE BEEN LOCKED OUT' : 'PIQABU TOWER MAINTENANCE';
    const icon = isBlock ? 'ban-outline' : 'construct-outline';
    const body = isBlock
        ? (blockReason?.trim()
            ? `You’ve been blocked from Piqabu.\n\nReason: ${blockReason}`
            : 'You’ve been blocked from Piqabu by the operator. No reason was given.')
        : (maintenanceMessage?.trim()
            ? maintenanceMessage
            : 'Piqabu Tower is under maintenance right now. The app is paused while we sort things out. Try again shortly.');
    const footer = isBlock
        ? 'Reach out to support if you believe this is in error.'
        : 'This screen will clear automatically when maintenance ends.';

    return (
        <Animated.View
            style={[styles.overlay, { opacity }]}
            pointerEvents="auto"
        >
            <View style={styles.card}>
                <View style={styles.iconWrap}>
                    <Ionicons name={icon} size={36} color={THEME.ink} />
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.body}>{body}</Text>
                <View style={styles.rule} />
                <Text style={styles.footer}>{footer}</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(6, 7, 9, 0.92)',
        zIndex: 10000, // sits above every other surface
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(245, 243, 235, 0.06)',
        borderWidth: 1,
        borderColor: THEME.edge,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 3,
        fontWeight: '900',
        color: THEME.ink,
        textAlign: 'center',
        marginBottom: 18,
    },
    body: {
        fontFamily: THEME.mono,
        fontSize: 13,
        lineHeight: 20,
        color: THEME.muted,
        textAlign: 'center',
        marginBottom: 18,
    },
    rule: {
        height: 1,
        alignSelf: 'stretch',
        backgroundColor: THEME.edge2,
        marginBottom: 16,
    },
    footer: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 1.2,
        color: THEME.faint,
        textAlign: 'center',
    },
});
