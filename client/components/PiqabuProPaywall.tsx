/**
 * PiqabuProPaywall
 *
 * Pseudo paywall for the Piqabu Keyboard (and other Pro features in
 * the future). Tap "SUBSCRIBE" → sets piqabu_pro_status = '1' in
 * secure-store, dismisses, and the parent re-reads the flag to switch
 * the CTA from "GET PRO" to the actual ENABLE action.
 *
 * Real payment processing isn't wired here — that's a follow-up that
 * replaces the inline setProAccess(true) call with a RevenueCat
 * purchase callback. Everything that reads the flag (the keyboard
 * onboarding step, SettingsPanel, the IME's Pro gate) stays
 * unchanged.
 */
import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Animated,
    Easing,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import { setProAccess } from '../lib/pro';

interface Props {
    visible: boolean;
    onDismiss: () => void;
    onSubscribed: () => void;
}

const PERKS = [
    'Piqabu Keyboard — open private channels from inside any chat app',
    'Up to 5 simultaneous rooms with different correspondents',
    'Live Glass — encrypted camera channel with blur',
    'Larger Reveal Vault capacity',
    'Priority signal-tower routing',
] as const;

export default function PiqabuProPaywall({ visible, onDismiss, onSubscribed }: Props) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(400)).current;
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ]),
            ).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 400, duration: 180, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
            pulse.stopAnimation();
        }
    }, [visible]);

    const handleSubscribe = async () => {
        // Pseudo: just flip the local flag. Real RevenueCat (or Stripe on
        // web) call replaces this line in the production wiring.
        await setProAccess(true);
        onSubscribed();
        onDismiss();
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
            <View style={styles.root}>
                <Animated.View style={[styles.backdrop, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
                </Animated.View>

                <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
                    <View style={styles.handle} />

                    <View style={styles.headerRow}>
                        <Animated.View style={[styles.dot, { opacity: pulse }]} />
                        <Text style={styles.title}>PIQABU PRO</Text>
                    </View>

                    <View style={styles.priceRow}>
                        <Text style={styles.priceMain}>$4.99</Text>
                        <Text style={styles.priceUnit}>/ month</Text>
                    </View>

                    <View style={styles.perksList}>
                        {PERKS.map((p, i) => (
                            <View key={i} style={styles.perkRow}>
                                <Ionicons name="checkmark" size={12} color={THEME.ink} />
                                <Text style={styles.perkText}>{p}</Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity onPress={handleSubscribe} style={styles.primary} activeOpacity={0.8}>
                        <Text style={styles.primaryText}>SUBSCRIBE</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onDismiss} style={styles.cancel} activeOpacity={0.7}>
                        <Text style={styles.cancelText}>NOT NOW</Text>
                    </TouchableOpacity>

                    <Text style={styles.footnote}>
                        ZERO ACCOUNTS · NO HISTORY · CANCEL ANY TIME
                    </Text>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
    sheet: {
        backgroundColor: THEME.paper,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: THEME.edge,
        paddingTop: 10,
        paddingBottom: 28,
        paddingHorizontal: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -16 },
        shadowOpacity: 0.6,
        shadowRadius: 32,
        elevation: 24,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: THEME.edge,
        marginBottom: 18,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    dot: {
        width: 9, height: 9, borderRadius: 5,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOpacity: 0.7,
        shadowRadius: 6,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 13,
        letterSpacing: 3,
        fontWeight: '900',
        color: THEME.ink,
    },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 22 },
    priceMain: {
        fontFamily: THEME.mono,
        fontSize: 36,
        color: THEME.ink,
        fontWeight: '900',
        letterSpacing: 1,
    },
    priceUnit: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        color: THEME.muted,
        fontWeight: '600',
    },
    perksList: { gap: 10, marginBottom: 24 },
    perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    perkText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        lineHeight: 16,
        color: THEME.ink,
        flex: 1,
    },
    primary: {
        backgroundColor: THEME.ink,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    primaryText: {
        fontFamily: THEME.mono,
        color: THEME.bg,
        fontSize: 12,
        letterSpacing: 3,
        fontWeight: '900',
    },
    cancel: {
        marginTop: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.edge2,
    },
    cancelText: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '600',
    },
    footnote: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: THEME.faint,
        textAlign: 'center',
        marginTop: 16,
    },
});
