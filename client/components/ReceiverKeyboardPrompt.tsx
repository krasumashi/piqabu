/**
 * ReceiverKeyboardPrompt
 *
 * One-time nudge for someone who joined a room by tapping a deep-link
 * (i.e. a *receiver*, not a sender). The asymmetry it fixes:
 *
 *   - The SENDER goes through onboarding and is shown the Piqabu
 *     Keyboard prompt repeatedly.
 *   - The RECEIVER taps a link in WhatsApp, lands in a room, and
 *     starts typing — likely with Gboard or another keyboard that
 *     phones home. They never even learn the Piqabu Keyboard exists.
 *
 * So: after a receiver's *first* deep-link join, surface a card
 * prompting them to enable the Piqabu Keyboard. They can dismiss; if
 * they do, we never nag again. Settings still has the entry if they
 * change their mind later.
 *
 * Trigger: app/j/[code].tsx writes `piqabu_receiver_keyboard_pending`
 * to secure-store on a deep-link arrival, ONLY IF
 * `piqabu_receiver_keyboard_seen` is unset. This component reads the
 * pending flag on mount, renders, and on dismissal clears the pending
 * flag AND sets the seen flag so it never re-appears.
 *
 * Android-only — no IME paradigm on iOS for v1.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../lib/platform/storage';

const PENDING_KEY = 'piqabu_receiver_keyboard_pending';
const SEEN_KEY    = 'piqabu_receiver_keyboard_seen';

export default function ReceiverKeyboardPrompt() {
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const opacity = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        (async () => {
            try {
                const pending = await getSecureItem(PENDING_KEY);
                if (pending === '1') setVisible(true);
            } catch { /* noop */ }
        })();
    }, []);

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: visible ? 240 : 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [visible]);

    const dismiss = async (action: 'enable' | 'later') => {
        // Both paths flip the seen flag so this never re-appears.
        try { await setSecureItem(SEEN_KEY, '1'); } catch { /* noop */ }
        try { await deleteSecureItem(PENDING_KEY); } catch { /* noop */ }
        setVisible(false);
        if (action === 'enable') {
            try {
                await Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS');
            } catch {
                try { await Linking.openSettings(); } catch { /* noop */ }
            }
        }
    };

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.overlay,
                { opacity, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
            ]}
            pointerEvents="auto"
        >
            <View style={styles.card}>
                <View style={styles.iconWrap}>
                    <Ionicons name="keypad-outline" size={28} color={THEME.ink} />
                </View>
                <Text style={styles.title}>PIQABU KEYBOARD</Text>
                <Text style={styles.body}>
                    For full privacy in this conversation, use the Piqabu Keyboard. Other keyboards may log your keystrokes to the cloud.
                </Text>
                <View style={styles.row}>
                    <TouchableOpacity
                        onPress={() => dismiss('later')}
                        activeOpacity={0.7}
                        style={[styles.btn, styles.btnGhost]}
                    >
                        <Text style={styles.btnGhostText}>NOT NOW</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => dismiss('enable')}
                        activeOpacity={0.85}
                        style={[styles.btn, styles.btnPrimary]}
                    >
                        <Text style={styles.btnPrimaryText}>ENABLE NOW</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.footnote}>
                    You can always enable it later from Settings.
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(6, 7, 9, 0.92)',
        zIndex: 9998, // just under LockoutOverlay (10000) and UpdateWall (9999)
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
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(245, 243, 235, 0.06)',
        borderWidth: 1, borderColor: THEME.edge,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 3,
        fontWeight: '900',
        color: THEME.ink,
        marginBottom: 12,
    },
    body: {
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.muted,
        textAlign: 'center',
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        alignSelf: 'stretch',
        marginBottom: 14,
    },
    btn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    btnGhost: {
        borderWidth: 1,
        borderColor: THEME.edge,
    },
    btnGhostText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '800',
        color: THEME.muted,
    },
    btnPrimary: {
        backgroundColor: THEME.ink,
    },
    btnPrimaryText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
    footnote: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.2,
        color: THEME.faint,
        textAlign: 'center',
    },
});
