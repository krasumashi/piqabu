/**
 * LiveLauncher
 *
 * "Piqa Live" entry point — a single button in the room header that opens
 * a bottom sheet offering the two live modalities:
 *
 *   - LIVE GLASS  → camera-to-camera (blurred / noir)
 *   - LIVE MIRROR → screen share (view-only, no save)
 *
 * Modelled on Gemini Live's launcher: one button, two clearly-labelled
 * options, each with a one-line description so the user knows what they're
 * about to start. Selecting either option dismisses the sheet and calls
 * the parent's handler.
 *
 * Behaviour-only — no WebRTC logic lives here. The launcher just routes
 * the user's choice to LiveGlassPanel or ScreenSharePanel via callbacks.
 */
import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Animated as RNAnimated,
    Pressable,
    Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface LiveLauncherProps {
    visible: boolean;
    onDismiss: () => void;
    onSelectGlass: () => void;
    onSelectMirror: () => void;
}

export default function LiveLauncher({
    visible,
    onDismiss,
    onSelectGlass,
    onSelectMirror,
}: LiveLauncherProps) {
    const translateY = useRef(new RNAnimated.Value(400)).current;
    const backdrop = useRef(new RNAnimated.Value(0)).current;
    const dotPulse = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(translateY, {
                    toValue: 0,
                    friction: 9,
                    tension: 70,
                    useNativeDriver: true,
                }),
                RNAnimated.timing(backdrop, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(dotPulse, {
                        toValue: 0.35,
                        duration: 700,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    RNAnimated.timing(dotPulse, {
                        toValue: 1,
                        duration: 700,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            RNAnimated.parallel([
                RNAnimated.timing(translateY, {
                    toValue: 400,
                    duration: 180,
                    useNativeDriver: true,
                }),
                RNAnimated.timing(backdrop, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
            dotPulse.stopAnimation();
        }
    }, [visible]);

    const handleSelect = (mode: 'glass' | 'mirror') => {
        // Live Mirror is gated as "coming soon" until the WebRTC screen
        // capture pipeline ships. The card is rendered as disabled below;
        // this guard is belt-and-braces in case the touchable still fires.
        if (mode === 'mirror') return;
        // Dismiss first so the sheet animates away cleanly,
        // then fire the parent callback on the next frame.
        onDismiss();
        requestAnimationFrame(() => {
            if (mode === 'glass') onSelectGlass();
            else onSelectMirror();
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onDismiss}
            statusBarTranslucent
        >
            <View style={styles.root}>
                {/* Backdrop — tap to dismiss */}
                <RNAnimated.View
                    style={[styles.backdrop, { opacity: backdrop }]}
                    pointerEvents={visible ? 'auto' : 'none'}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
                </RNAnimated.View>

                {/* Bottom sheet */}
                <RNAnimated.View
                    style={[styles.sheet, { transform: [{ translateY }] }]}
                >
                    {/* Drag handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.headerRow}>
                        <RNAnimated.View style={[styles.liveDot, { opacity: dotPulse }]} />
                        <Text style={styles.title}>PIQA LIVE</Text>
                    </View>
                    <Text style={styles.subtitle}>
                        Start a real-time channel with your correspondent.
                    </Text>

                    {/* Options */}
                    <View style={styles.options}>
                        <TouchableOpacity
                            onPress={() => handleSelect('glass')}
                            style={styles.optionCard}
                            activeOpacity={0.75}
                        >
                            <View style={styles.optionIconWrap}>
                                <Ionicons name="videocam-outline" size={26} color={THEME.ink} />
                            </View>
                            <View style={styles.optionTextWrap}>
                                <Text style={styles.optionLabel}>LIVE GLASS</Text>
                                <Text style={styles.optionDesc}>
                                    Camera-to-camera. Blur and noir filters on by default.
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={THEME.faint} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => handleSelect('mirror')}
                            style={[styles.optionCard, styles.optionCardDisabled]}
                            activeOpacity={1}
                            disabled
                        >
                            <View style={[styles.optionIconWrap, styles.optionIconWrapDisabled]}>
                                <Ionicons name="phone-portrait-outline" size={26} color={THEME.faint} />
                            </View>
                            <View style={styles.optionTextWrap}>
                                <Text style={[styles.optionLabel, { color: THEME.muted }]}>LIVE MIRROR</Text>
                                <Text style={styles.optionDesc}>
                                    Share your screen. View-only — no save, no screenshots.
                                </Text>
                            </View>
                            <View style={styles.comingSoonPill}>
                                <Text style={styles.comingSoonText}>SOON</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* Footer */}
                    <Text style={styles.footer}>
                        ZERO TRACE · PEER-TO-PEER · NOTHING IS RECORDED
                    </Text>

                    {/* Cancel */}
                    <TouchableOpacity
                        onPress={onDismiss}
                        style={styles.cancelBtn}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.cancelText}>CANCEL</Text>
                    </TouchableOpacity>
                </RNAnimated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.65)',
    },
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
        paddingHorizontal: 18,
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
        marginBottom: 14,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
    },
    liveDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 6,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 13,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.ink,
    },
    subtitle: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 0.5,
        color: THEME.muted,
        marginBottom: 18,
    },
    options: {
        gap: 10,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: THEME.paper2,
        borderWidth: 1,
        borderColor: THEME.edge2,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    optionCardDisabled: {
        opacity: 0.55,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    optionIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.edge2,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionIconWrapDisabled: {
        backgroundColor: 'transparent',
        borderStyle: 'dashed',
    },
    comingSoonPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    comingSoonText: {
        fontFamily: THEME.mono,
        fontSize: 8,
        letterSpacing: 1.4,
        fontWeight: '900',
        color: THEME.muted,
    },
    optionTextWrap: {
        flex: 1,
    },
    optionLabel: {
        fontFamily: THEME.mono,
        fontSize: 12,
        letterSpacing: 1.6,
        fontWeight: '800',
        color: THEME.ink,
        marginBottom: 3,
    },
    optionDesc: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 0.4,
        lineHeight: 14,
        color: THEME.muted,
    },
    footer: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.4,
        color: THEME.faint,
        textAlign: 'center',
        marginTop: 18,
    },
    cancelBtn: {
        marginTop: 14,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.edge2,
    },
    cancelText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '700',
        color: THEME.muted,
    },
});
