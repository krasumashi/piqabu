/**
 * UpdateBanner
 *
 * SOFT update notice — dismissable banner that slides down from the
 * top. Operator pushes this from Mission Control with mode='soft'
 * when there's a new version users *should* take but don't have to
 * take right now. The corresponding HARD path is UpdateWall (full-
 * screen lock).
 *
 * Behavior:
 *   - Shown when notice.mode === 'soft' and the notice id hasn't
 *     been dismissed in this device's secure-store.
 *   - UPDATE button calls applyUpdate(notice). On success (reloaded
 *     or opened-apk) the banner disappears via the natural app
 *     reload / context switch. On noop we surface the reason inline.
 *   - LATER (X) records the dismissal locally so this exact notice
 *     stays quiet, even across app restarts, until the operator
 *     clears or replaces it (which mints a fresh id).
 *
 * Sits at zIndex 195 — above SystemBanner / OperatorBanner stack but
 * below LockoutOverlay (10000), since a hard lockout always wins.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { applyUpdate, UpdateNotice } from '../lib/updateApplier';

interface Props {
    notice: UpdateNotice | null;
    dismissedNoticeId: string | null;
    onDismiss: (noticeId: string) => void;
}

export default function UpdateBanner({ notice, dismissedNoticeId, onDismiss }: Props) {
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-260)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const [working, setWorking] = useState(false);
    const [noopReason, setNoopReason] = useState<string | null>(null);

    const visible = !!notice
        && notice.mode === 'soft'
        && notice.id !== dismissedNoticeId;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: -260, duration: 200, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
            ]).start();
        }
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
        // reloaded / opened-apk paths — leave working=true; the app is
        // about to reload or the browser is about to take focus.
    };

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
                    <Ionicons name="cloud-download-outline" size={14} color={THEME.ink} />
                    <Text style={styles.label}>
                        {(notice.title?.trim() || 'UPDATE AVAILABLE').toUpperCase()}
                        {notice.targetVersion ? `  ·  ${notice.targetVersion}` : ''}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => onDismiss(notice.id)} style={styles.closeBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={14} color={THEME.muted} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.message}>{notice.message}</Text>
                {noopReason && (
                    <Text style={styles.noopReason}>{noopReason}</Text>
                )}
                <TouchableOpacity
                    onPress={onUpdate}
                    disabled={working}
                    activeOpacity={0.85}
                    style={[styles.updateBtn, working && { opacity: 0.5 }]}
                >
                    <Text style={styles.updateBtnText}>
                        {working ? 'WORKING…' : 'UPDATE'}
                    </Text>
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
        zIndex: 195,
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
        marginBottom: 12,
    },
    noopReason: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.warn,
        lineHeight: 15,
        marginBottom: 10,
        letterSpacing: 0.4,
    },
    updateBtn: {
        alignSelf: 'flex-end',
        backgroundColor: THEME.ink,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    updateBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
});
