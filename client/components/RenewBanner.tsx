/**
 * RenewBanner
 *
 * Sits in the same slide-down slot as SystemBanner / UpdateBanner, with
 * one job: surface the "your Pro entitlement is in its 14-day grace
 * window — renew now" prompt during the soft-expiry window.
 *
 * Not dismissable. Showing during grace is the entire UX contract for
 * "soft expiry" — make it impossible to miss without locking the user
 * out. The renew action routes to /upgrade and re-triggers the Paystack
 * checkout for another year.
 *
 * Hidden in all other states (free tier, healthy pre-expiry Pro,
 * already-locked-out post-grace).
 *
 * zIndex 197 — above SystemBanner (195) and UpdateBanner (195) but
 * below OperatorBanner (200) and the lockout/update walls. The renew
 * nudge matters but a personal operator message to YOU specifically
 * still wins precedence.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { THEME } from '../constants/Theme';
import { useProTimeline } from '../lib/pro';
import { usePricing } from '../lib/payment/usePricing';

export default function RenewBanner() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { timeline } = useProTimeline();
    const { pricing } = usePricing();
    const translateY = useRef(new Animated.Value(-260)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    const visible = timeline.inGracePeriod;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: visible ? 0 : -260,
                duration: visible ? 280 : 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: visible ? 1 : 0,
                duration: visible ? 240 : 180,
                useNativeDriver: true,
            }),
        ]).start();
    }, [visible]);

    if (!visible) return null;

    const daysLeft = timeline.daysUntilHardLockout ?? 0;
    const dayLabel = daysLeft === 1 ? 'day' : 'days';

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
            <View style={styles.card}>
                <View style={styles.header}>
                    <Ionicons name="hourglass-outline" size={14} color={THEME.warn} />
                    <Text style={styles.label}>PRO RENEWAL DUE</Text>
                </View>
                <Text style={styles.message}>
                    Your Piqabu Pro is in its grace window. {daysLeft} {dayLabel} until access locks. Renew to keep going.
                </Text>
                <TouchableOpacity
                    onPress={() => router.push('/upgrade')}
                    activeOpacity={0.85}
                    style={styles.renewBtn}
                >
                    <Text style={styles.renewBtnText}>RENEW · {pricing.displayPrice}</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 197,
        paddingHorizontal: 12,
    },
    card: {
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: 'rgba(180, 180, 180, 0.55)',
        borderRadius: 16,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 16,
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
        color: THEME.warn,
        fontWeight: '800',
    },
    message: {
        fontFamily: THEME.mono,
        fontSize: 12,
        color: THEME.ink,
        lineHeight: 17,
        letterSpacing: 0.3,
        marginBottom: 12,
    },
    renewBtn: {
        alignSelf: 'flex-end',
        backgroundColor: THEME.ink,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    renewBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
});
