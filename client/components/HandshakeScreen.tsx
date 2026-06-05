/**
 * HandshakeScreen
 *
 * Shown as the very first frame when a user opens a room that has just
 * reached LINKED state (both parties present). Establishes:
 *   - the ephemeral framing ("one-time channel")
 *   - the mutual fingerprint (server-trust check)
 *   - a quiet auto-keyboard prompt (for Android users without the Piqabu
 *     Keyboard enabled yet)
 *
 * Dismisses to the normal room view (START TYPING) or back to the
 * landing screen (DISMISS, which also removes the room).
 *
 * Per-room ack is persisted in AsyncStorage under `piqabu_handshake_acks`
 * so the screen never re-shows for a room the user has already entered.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    Linking,
    Platform,
    BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME } from '../constants/Theme';
import Fingerprint from './Fingerprint';
import type { Fingerprint as FingerprintType } from '../hooks/usePartnerHandshake';

const ACK_STORAGE_KEY = 'piqabu_handshake_acks';
const SUPPRESS_KEYBOARD_PROMPT_KEY = 'piqabu_keyboard_prompt_dismissed';

interface Props {
    visible: boolean;
    roomCode: string;
    /** Whether the partner has joined the room yet. WAITING vs LINKED. */
    linked: boolean;
    fingerprint: FingerprintType | null;
    onStartTyping: () => void;
    onDismiss: () => void;
}

function openKeyboardSettings() {
    if (Platform.OS !== 'android') return;
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(() => {
        Linking.openSettings().catch(() => {});
    });
}

export default function HandshakeScreen({
    visible,
    roomCode,
    linked,
    fingerprint,
    onStartTyping,
    onDismiss,
}: Props) {
    const opacity = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    const [showKeyboardPrompt, setShowKeyboardPrompt] = useState(false);

    useEffect(() => {
        // Only Android can use the keyboard for now. Suppress on iOS/web.
        if (Platform.OS !== 'android') return;
        (async () => {
            const dismissed = await AsyncStorage.getItem(SUPPRESS_KEYBOARD_PROMPT_KEY);
            setShowKeyboardPrompt(dismissed !== 'true');
        })();
    }, []);

    useEffect(() => {
        if (visible) {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 240,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ]),
            ).start();
        } else {
            Animated.timing(opacity, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }).start();
            pulse.stopAnimation();
        }
    }, [visible]);

    if (!visible) return null;

    const handleStart = () => {
        onStartTyping();
    };

    const handleDismissPrompt = async () => {
        setShowKeyboardPrompt(false);
        try { await AsyncStorage.setItem(SUPPRESS_KEYBOARD_PROMPT_KEY, 'true'); } catch { }
    };

    return (
        <Animated.View
            style={[StyleSheet.absoluteFill, styles.container, { opacity }]}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <View style={styles.body}>
                {/* Pulse dot */}
                <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />

                <Text style={styles.linkedLabel}>
                    {linked ? 'LINKED' : 'WAITING FOR CORRESPONDENT'}
                </Text>
                <Text style={styles.code}>{roomCode}</Text>
                <Text style={styles.oneTime}>
                    {linked ? 'ONE-TIME CHANNEL' : 'SHARE THE LINK · THEY TAP · YOU CONNECT'}
                </Text>

                {linked && (
                    <>
                        <View style={styles.divider} />
                        <Fingerprint value={fingerprint} />
                    </>
                )}

                <View style={styles.divider} />

                {/* Actions — primary is enabled only once linked. */}
                <TouchableOpacity
                    onPress={handleStart}
                    style={[styles.primary, !linked && styles.primaryDisabled]}
                    activeOpacity={linked ? 0.8 : 1}
                    disabled={!linked}
                >
                    <Text style={[styles.primaryText, !linked && styles.primaryTextDisabled]}>
                        {linked ? 'START TYPING' : 'WAITING…'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onDismiss} style={styles.secondary} activeOpacity={0.7}>
                    <Text style={styles.secondaryText}>
                        {linked ? 'DISMISS' : 'CANCEL'}
                    </Text>
                </TouchableOpacity>

                {/* WAITING-state only: a quick way back to the host app
                    (WhatsApp etc) without losing the session. The room
                    stays alive in the rooms list; user can come back via
                    the OPEN button on the keyboard. Android-only —
                    BackHandler.exitApp moves the task to back. */}
                {!linked && Platform.OS === 'android' && (
                    <TouchableOpacity
                        onPress={() => BackHandler.exitApp()}
                        style={styles.tertiary}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="arrow-back-outline" size={12} color={THEME.muted} />
                        <Text style={styles.tertiaryText}>BACK TO HOST APP</Text>
                    </TouchableOpacity>
                )}

                {/* Auto-keyboard prompt — only the first time. */}
                {showKeyboardPrompt && (
                    <View style={styles.keyboardPrompt}>
                        <View style={styles.keyboardPromptHeader}>
                            <Ionicons name="keypad-outline" size={12} color={THEME.muted} />
                            <Text style={styles.keyboardPromptTitle}>NEXT TIME, FROM WHATSAPP</Text>
                        </View>
                        <Text style={styles.keyboardPromptBody}>
                            Enable the Piqabu Keyboard and you can open a channel from inside any chat app.
                        </Text>
                        <View style={styles.keyboardPromptActions}>
                            <TouchableOpacity
                                onPress={openKeyboardSettings}
                                style={styles.keyboardPromptCta}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.keyboardPromptCtaText}>ENABLE</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleDismissPrompt}
                                style={styles.keyboardPromptDismiss}
                                activeOpacity={0.6}
                            >
                                <Text style={styles.keyboardPromptDismissText}>NOT NOW</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Ack persistence helpers                                               */
/* ────────────────────────────────────────────────────────────────────── */

export async function hasAckedHandshake(roomId: string): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(ACK_STORAGE_KEY);
        if (!raw) return false;
        const acks: string[] = JSON.parse(raw);
        return Array.isArray(acks) && acks.includes(roomId);
    } catch {
        return false;
    }
}

export async function ackHandshake(roomId: string): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(ACK_STORAGE_KEY);
        const acks: string[] = raw ? JSON.parse(raw) : [];
        if (!acks.includes(roomId)) acks.push(roomId);
        // Trim to last 32 entries to keep the blob small.
        const trimmed = acks.slice(-32);
        await AsyncStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // Best-effort — failure just means the user might see the
        // handshake again, which is harmless.
    }
}

export async function unackHandshake(roomId: string): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(ACK_STORAGE_KEY);
        if (!raw) return;
        const acks: string[] = JSON.parse(raw);
        const next = acks.filter(id => id !== roomId);
        await AsyncStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(next));
    } catch { }
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: THEME.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 100,
    },
    body: {
        alignItems: 'center',
        maxWidth: 380,
        width: '100%',
    },
    pulseDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: THEME.ink,
        marginBottom: 28,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.6,
        shadowRadius: 12,
    },
    linkedLabel: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 10,
        letterSpacing: 3,
        fontWeight: '700',
        marginBottom: 10,
    },
    code: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 36,
        letterSpacing: 6,
        fontWeight: '900',
        marginBottom: 6,
    },
    oneTime: {
        fontFamily: THEME.mono,
        color: THEME.faint,
        fontSize: 9,
        letterSpacing: 2.5,
        fontWeight: '600',
    },
    divider: {
        width: 60,
        height: 1,
        backgroundColor: THEME.edge,
        marginVertical: 28,
    },
    primary: {
        backgroundColor: THEME.ink,
        paddingVertical: 14,
        paddingHorizontal: 36,
        borderRadius: 14,
        marginTop: 8,
    },
    primaryDisabled: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: THEME.edge2,
    },
    primaryText: {
        fontFamily: THEME.mono,
        color: THEME.bg,
        fontSize: 12,
        letterSpacing: 3,
        fontWeight: '900',
        textAlign: 'center',
    },
    primaryTextDisabled: {
        color: THEME.faint,
    },
    secondary: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        marginTop: 8,
    },
    secondaryText: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '600',
    },
    tertiary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 18,
        marginTop: 4,
    },
    tertiaryText: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 9,
        letterSpacing: 1.6,
        fontWeight: '600',
    },
    keyboardPrompt: {
        marginTop: 32,
        padding: 16,
        borderWidth: 1,
        borderColor: THEME.edge2,
        borderRadius: 14,
        backgroundColor: THEME.paper,
        width: '100%',
    },
    keyboardPromptHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    keyboardPromptTitle: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '700',
    },
    keyboardPromptBody: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 11,
        lineHeight: 16,
        marginBottom: 12,
    },
    keyboardPromptActions: {
        flexDirection: 'row',
        gap: 12,
    },
    keyboardPromptCta: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: THEME.ink,
    },
    keyboardPromptCtaText: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '900',
    },
    keyboardPromptDismiss: {
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    keyboardPromptDismissText: {
        fontFamily: THEME.mono,
        color: THEME.faint,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '600',
    },
});
