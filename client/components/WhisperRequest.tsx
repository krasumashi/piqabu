import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface WhisperRequestProps {
    visible: boolean;
    onAccept?: () => void;
    onDecline?: () => void;
}

export default function WhisperRequest({ visible, onAccept, onDecline }: WhisperRequestProps) {
    const translateY = useRef(new RNAnimated.Value(-50)).current;
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
                RNAnimated.timing(translateY, { toValue: -50, duration: 150, useNativeDriver: true }),
                RNAnimated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
            dotPulse.stopAnimation();
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <RNAnimated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
            <View style={styles.card}>
                <View style={styles.left}>
                    <RNAnimated.View style={[styles.dot, { opacity: dotPulse }]} />
                    <Text style={styles.text}>INCOMING WHISPER...</Text>
                </View>

                <View style={styles.actions}>
                    {onDecline && (
                        <TouchableOpacity onPress={onDecline} style={styles.declineBtn} activeOpacity={0.7}>
                            <Ionicons name="call-outline" size={14} color={THEME.accDanger} style={{ transform: [{ rotate: '135deg' }] }} />
                        </TouchableOpacity>
                    )}
                    {onAccept && (
                        <TouchableOpacity onPress={onAccept} style={styles.acceptBtn} activeOpacity={0.7}>
                            <Ionicons name="call-outline" size={14} color="#000" />
                        </TouchableOpacity>
                    )}
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
        gap: 16,
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.accEmerald,
        borderRadius: 16,
        paddingVertical: 8,
        paddingLeft: 16,
        paddingRight: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 12,
        maxWidth: '90%',
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: THEME.accEmerald,
        shadowColor: THEME.accEmerald,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    text: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.1,
        color: '#fff',
        fontWeight: '600',
        textTransform: 'uppercase',
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
        backgroundColor: THEME.accEmerald,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
