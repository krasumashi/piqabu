/**
 * SystemBanner
 *
 * Renders the two operator-level system signals from Mission Control:
 *
 *   - MAINTENANCE MODE — persistent banner across the top while the
 *     server is in maintenance. Clears automatically when the operator
 *     turns it back off.
 *
 *   - ADMIN BROADCAST — temporary banner pushed by the operator via
 *     POST /admin/broadcast. Auto-dismisses after ~10 seconds, or the
 *     user can tap CLOSE early.
 *
 * Maintenance always takes precedence — if both fire at once, the
 * maintenance banner shows. Distinct from OperatorBanner: that one is
 * a one-to-one operator reply to a feedback submission; this one is
 * a system-wide signal.
 *
 * Both states are collected by useSocketManager (already wired); this
 * component just renders them. Mounted globally in app/_layout.tsx so
 * the banners can land regardless of which screen the user is on.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';

interface Props {
    maintenanceMode: boolean;
    maintenanceMessage: string;
    broadcast: string | null;
    onDismissBroadcast: () => void;
}

export default function SystemBanner({
    maintenanceMode,
    maintenanceMessage,
    broadcast,
    onDismissBroadcast,
}: Props) {
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-220)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    const visible = maintenanceMode || broadcast !== null;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: -220, duration: 180, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    if (!visible) return null;

    const showMaintenance = maintenanceMode;

    return (
        <Animated.View
            style={[
                styles.wrapper,
                {
                    paddingTop: insets.top + 6,
                    opacity,
                    transform: [{ translateY }],
                },
            ]}
            pointerEvents="box-none"
        >
            {showMaintenance ? (
                <View style={[styles.card, styles.maintenanceCard]}>
                    <View style={styles.header}>
                        <Ionicons name="construct-outline" size={14} color={THEME.warn} />
                        <Text style={[styles.label, { color: THEME.warn }]}>
                            MAINTENANCE
                        </Text>
                    </View>
                    <Text style={styles.message}>
                        {maintenanceMessage?.trim() || 'Piqabu Tower is under scheduled maintenance. Sessions may be paused briefly.'}
                    </Text>
                </View>
            ) : broadcast !== null ? (
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Ionicons name="megaphone-outline" size={14} color={THEME.ink} />
                        <Text style={styles.label}>PIQABU TOWER</Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity onPress={onDismissBroadcast} style={styles.closeBtn} activeOpacity={0.7}>
                            <Ionicons name="close" size={14} color={THEME.muted} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.message}>{broadcast}</Text>
                </View>
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 195, // sit just below OperatorBanner (200) so a personal
                     // reply still takes precedence over a system message.
        paddingHorizontal: 12,
    },
    card: {
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 16,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 16,
    },
    maintenanceCard: {
        borderColor: 'rgba(180, 180, 180, 0.55)',
        backgroundColor: 'rgba(180, 180, 180, 0.08)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    label: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: THEME.muted,
        fontWeight: '800',
    },
    closeBtn: { padding: 4 },
    message: {
        fontFamily: THEME.mono,
        fontSize: 12,
        color: THEME.ink,
        lineHeight: 17,
        letterSpacing: 0.3,
    },
});
