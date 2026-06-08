/**
 * OperatorBanner
 *
 * Slides down from the top when the Piqabu server pushes an
 * `operator_message` event (Mission Control reply to a feedback the
 * user submitted). Single-message-at-a-time; if a second reply arrives
 * while one is showing, the new one replaces the old.
 *
 * Ephemeral by design — once the user dismisses, the banner emits
 * `operator_message_dismissed` so the server marks it read and stops
 * re-delivering on reconnect. No persistence in the app.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Socket } from 'socket.io-client';
import { THEME } from '../constants/Theme';

interface IncomingMessage {
    id: string;
    message: string;
    sentAt: string;
    inReplyTo?: string;
}

interface Props {
    socket: Socket | null;
}

export default function OperatorBanner({ socket }: Props) {
    const [active, setActive] = useState<IncomingMessage | null>(null);
    const [expanded, setExpanded] = useState(false);
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-160)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!socket) return;
        const handler = (data: IncomingMessage) => {
            if (!data || typeof data.id !== 'string' || typeof data.message !== 'string') return;
            setActive(data);
            setExpanded(false);
        };
        socket.on('operator_message', handler);
        return () => { socket.off('operator_message', handler); };
    }, [socket]);

    useEffect(() => {
        if (active) {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: -160, duration: 220, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
            ]).start();
        }
    }, [active]);

    const dismiss = () => {
        if (!active) return;
        try { socket?.emit('operator_message_dismissed', { id: active.id }); } catch { }
        setActive(null);
        setExpanded(false);
    };

    if (!active) return null;

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
                    <View style={styles.dot} />
                    <Text style={styles.fromLabel}>PIQABU TOWER</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={dismiss} style={styles.closeBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={14} color={THEME.muted} />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setExpanded(e => !e)}
                >
                    <Text
                        style={styles.message}
                        numberOfLines={expanded ? undefined : 2}
                    >
                        {active.message}
                    </Text>
                    {active.message.length > 80 && (
                        <Text style={styles.expandHint}>
                            {expanded ? 'TAP TO COLLAPSE' : 'TAP TO READ'}
                        </Text>
                    )}
                </TouchableOpacity>
                {active.inReplyTo && expanded && (
                    <View style={styles.inReplyTo}>
                        <Text style={styles.inReplyToLabel}>IN REPLY TO YOUR MESSAGE:</Text>
                        <Text style={styles.inReplyToBody} numberOfLines={3}>
                            “{active.inReplyTo}”
                        </Text>
                    </View>
                )}
                <View style={styles.actions}>
                    <TouchableOpacity onPress={dismiss} style={styles.dismissBtn} activeOpacity={0.75}>
                        <Text style={styles.dismissBtnText}>GOT IT</Text>
                    </TouchableOpacity>
                </View>
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
        zIndex: 200,
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
        marginBottom: 8,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.7,
        shadowRadius: 5,
    },
    fromLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: THEME.muted,
        fontWeight: '800',
    },
    closeBtn: {
        padding: 4,
    },
    message: {
        fontFamily: THEME.mono,
        fontSize: 12,
        color: THEME.ink,
        lineHeight: 17,
        letterSpacing: 0.3,
    },
    expandHint: {
        fontFamily: THEME.mono,
        fontSize: 8,
        letterSpacing: 1.6,
        color: THEME.faint,
        fontWeight: '700',
        marginTop: 6,
    },
    inReplyTo: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: THEME.edge2,
    },
    inReplyToLabel: {
        fontFamily: THEME.mono,
        fontSize: 8,
        letterSpacing: 1.6,
        color: THEME.faint,
        fontWeight: '700',
        marginBottom: 4,
    },
    inReplyToBody: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.muted,
        fontStyle: Platform.select({ ios: 'italic', android: 'normal' }),
        lineHeight: 14,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 12,
    },
    dismissBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: THEME.edge,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    dismissBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 1.6,
        color: THEME.ink,
        fontWeight: '900',
    },
});
