/**
 * SignatureModal
 *
 * v1 doc-signing flow (type-name approach). Receiver of a revealed PDF
 * taps SIGN & RETURN in PeepDeck → this modal opens → user types their
 * name → preview renders in a script-style font → SIGN sends a clean
 * "✓ SIGNED · {name} · {ISO date}" line back to the sender via the
 * existing text channel.
 *
 * v2 (later): swap the text input for a finger-draw signature pad.
 * Same shape — onSign callback returns a string, parent fires it back.
 *
 * v3 (later): composite the signature onto the PDF itself and return the
 * signed PDF as a reveal. Bigger lift — needs PDF byte manipulation.
 *
 * Brand: monochrome, terse, no per-keystroke nonsense. The signature
 * line itself is ephemeral by inheritance — it travels through the
 * same Socket.IO text channel as every other message, with the same
 * zero-trace posture.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Animated,
    Pressable,
    Easing,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface Props {
    visible: boolean;
    onDismiss: () => void;
    /** Receives the formatted "✓ SIGNED · ..." line ready to wire into sendText. */
    onSign: (signatureLine: string) => void;
    /** Optional context to include in the signature line — e.g. the doc filename. */
    docLabel?: string;
}

function formatSignatureLine(name: string, docLabel?: string): string {
    const trimmed = name.trim();
    const stamp = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
    const docPart = docLabel ? ` · ${docLabel}` : '';
    return `✓ SIGNED · ${trimmed}${docPart} · ${stamp}`;
}

export default function SignatureModal({ visible, onDismiss, onSign, docLabel }: Props) {
    const [name, setName] = useState('');
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(400)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 400, duration: 180, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
            // Don't auto-clear `name` — user might re-open and resume.
        }
    }, [visible]);

    const canSign = name.trim().length >= 2;

    const handleSign = () => {
        if (!canSign) return;
        onSign(formatSignatureLine(name, docLabel));
        onDismiss();
        // Clear for the next session — signatures aren't reused.
        setTimeout(() => setName(''), 220);
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.root}
            >
                <Animated.View style={[styles.backdrop, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
                </Animated.View>

                <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
                    <View style={styles.handle} />

                    <View style={styles.headerRow}>
                        <Ionicons name="create-outline" size={14} color={THEME.ink} />
                        <Text style={styles.title}>SIGN &amp; RETURN</Text>
                    </View>

                    <Text style={styles.sub}>
                        Type your name. A signed acknowledgement is sent back through the same private channel — no copy persists beyond the session.
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="YOUR NAME"
                        placeholderTextColor={THEME.faint}
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={64}
                        returnKeyType="done"
                        onSubmitEditing={handleSign}
                    />

                    <View style={styles.previewBox}>
                        <Text style={styles.previewLabel}>PREVIEW</Text>
                        <Text style={styles.previewSig} numberOfLines={1}>
                            {name.trim() || '—'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleSign}
                        style={[styles.primary, !canSign && styles.primaryDisabled]}
                        activeOpacity={canSign ? 0.8 : 1}
                        disabled={!canSign}
                    >
                        <Text style={[styles.primaryText, !canSign && { color: THEME.faint }]}>SIGN</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onDismiss} style={styles.cancel} activeOpacity={0.7}>
                        <Text style={styles.cancelText}>CANCEL</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
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
    },
    handle: {
        alignSelf: 'center',
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: THEME.edge,
        marginBottom: 16,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    title: {
        fontFamily: THEME.mono,
        fontSize: 12, letterSpacing: 2.5, fontWeight: '900',
        color: THEME.ink,
    },
    sub: {
        fontFamily: THEME.mono,
        fontSize: 10, lineHeight: 14,
        color: THEME.muted,
        marginBottom: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 12,
        padding: 14,
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 12,
        letterSpacing: 2,
        fontWeight: '700',
    },
    previewBox: {
        marginTop: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: THEME.edge2,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.025)',
    },
    previewLabel: {
        fontFamily: THEME.mono,
        fontSize: 8, letterSpacing: 1.8, fontWeight: '600',
        color: THEME.faint,
        marginBottom: 8,
    },
    previewSig: {
        // Italic + serif looks like a signature line at a glance.
        fontStyle: 'italic',
        fontSize: 26,
        color: THEME.ink,
        fontWeight: '600',
        // Use the platform serif font for a script-ish feel.
        fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    },
    primary: {
        marginTop: 18,
        backgroundColor: THEME.ink,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    primaryDisabled: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: THEME.edge2,
    },
    primaryText: {
        fontFamily: THEME.mono,
        color: THEME.bg,
        fontSize: 12, letterSpacing: 3, fontWeight: '900',
    },
    cancel: {
        marginTop: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 10, letterSpacing: 2, fontWeight: '600',
    },
});
