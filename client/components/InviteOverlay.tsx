import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface InviteOverlayProps {
    visible: boolean;
    feature: string; // 'WHISPER' or 'LIVE GLASS'
    onAccept: () => void;
    onDecline: () => void;
}

export default function InviteOverlay({ visible, feature, onAccept, onDecline }: InviteOverlayProps) {
    const translateY = useRef(new RNAnimated.Value(-60)).current;
    const opacity = useRef(new RNAnimated.Value(0)).current;
    const dotPulse = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }),
                RNAnimated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(dotPulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
                    RNAnimated.timing(dotPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            RNAnimated.parallel([
                RNAnimated.timing(translateY, { toValue: -60, duration: 150, useNativeDriver: true }),
                RNAnimated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
            dotPulse.stopAnimation();
        }
    }, [visible]);

    if (!visible) return null;

    const icon = feature === 'LIVE GLASS' ? 'videocam-outline' : 'mic-outline';

    return (
        <RNAnimated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
            <View style={styles.card}>
                <View style={styles.left}>
                    <RNAnimated.View style={[styles.dot, { opacity: dotPulse }]} />
                    <Ionicons name={icon as any} size={14} color="#fff" />
                    <Text style={styles.text}>PARTNER REQUESTS {feature}</Text>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity onPress={onDecline} style={styles.declineBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={14} color={THEME.bad} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onAccept} style={styles.acceptBtn} activeOpacity={0.7}>
                        <Ionicons name="checkmark" size={14} color="#000" />
                    </TouchableOpacity>
                </View>
            </View>
        </RNAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 20,
        left: 0,
        right: 0,
        zIndex: 60,
        alignItems: 'center',
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        borderRadius: 16,
        paddingVertical: 8,
        paddingLeft: 16,
        paddingRight: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 12,
        maxWidth: '92%',
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
    },
    text: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.1,
        color: '#fff',
        fontWeight: '600',
        textTransform: 'uppercase',
        flexShrink: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    declineBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
