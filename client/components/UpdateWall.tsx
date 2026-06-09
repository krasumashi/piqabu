/**
 * UpdateWall
 *
 * HARD update notice — full-screen, undismissable wall. Operator pushes
 * this from Mission Control with mode='hard' when an update is
 * mandatory (breaking server-contract change, critical bug fix). User
 * literally can't reach the app until they either run the update or
 * the operator clears the wall.
 *
 * Same visual posture as LockoutOverlay so the user reads the cue
 * correctly: app is paused. zIndex 9999 — sits just under LockoutOverlay
 * (10000) so a maintenance lock or a personal block still trumps an
 * update wall. If the operator has triggered both, they get the
 * stricter signal first, which matches operator intent.
 *
 * Cached in secure-store by useSocketManager — survives close+reopen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import { applyUpdate, UpdateNotice } from '../lib/updateApplier';

interface Props {
    notice: UpdateNotice | null;
}

export default function UpdateWall({ notice }: Props) {
    const opacity = useRef(new Animated.Value(0)).current;
    const [working, setWorking] = useState(false);
    const [noopReason, setNoopReason] = useState<string | null>(null);

    const visible = !!notice && notice.mode === 'hard';

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: visible ? 240 : 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [visible]);

    if (!visible || !notice) return null;

    const onUpdate = async () => {
        setWorking(true);
        setNoopReason(null);
        const result = await applyUpdate(notice);
        if (result.kind === 'noop') {
            setNoopReason(result.reason);
            setWorking(false);
        }
        // reloaded / opened-apk paths — app is about to reload or the
        // system browser is about to take focus. Keep working=true.
    };

    return (
        <Animated.View
            style={[styles.overlay, { opacity }]}
            pointerEvents="auto"
        >
            <View style={styles.card}>
                <View style={styles.iconWrap}>
                    <Ionicons name="cloud-download-outline" size={36} color={THEME.ink} />
                </View>
                <Text style={styles.title}>
                    {(notice.title?.trim() || 'UPDATE REQUIRED').toUpperCase()}
                </Text>
                {notice.targetVersion ? (
                    <Text style={styles.version}>{notice.targetVersion}</Text>
                ) : null}
                <Text style={styles.body}>
                    {notice.message?.trim() || 'A required update is available. The app is paused until you install it.'}
                </Text>
                {noopReason && (
                    <Text style={styles.noopReason}>{noopReason}</Text>
                )}
                <TouchableOpacity
                    onPress={onUpdate}
                    disabled={working}
                    activeOpacity={0.85}
                    style={[styles.cta, working && { opacity: 0.5 }]}
                >
                    <Text style={styles.ctaText}>{working ? 'WORKING…' : 'UPDATE NOW'}</Text>
                </TouchableOpacity>
                <View style={styles.rule} />
                <Text style={styles.footer}>
                    This screen will clear automatically after the update completes.
                </Text>
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
        zIndex: 9999, // just below LockoutOverlay's 10000
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
        marginBottom: 6,
    },
    version: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        color: THEME.faint,
        textAlign: 'center',
        marginBottom: 14,
    },
    body: {
        fontFamily: THEME.mono,
        fontSize: 13,
        lineHeight: 20,
        color: THEME.muted,
        textAlign: 'center',
        marginBottom: 18,
    },
    noopReason: {
        fontFamily: THEME.mono,
        fontSize: 11,
        color: THEME.warn,
        lineHeight: 15,
        textAlign: 'center',
        marginBottom: 14,
        letterSpacing: 0.4,
    },
    cta: {
        backgroundColor: THEME.ink,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 18,
    },
    ctaText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 3,
        fontWeight: '900',
        color: THEME.bg,
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
