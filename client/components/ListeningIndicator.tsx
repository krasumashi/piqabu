import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { THEME } from '../constants/Theme';

interface ListeningIndicatorProps {
    incomingWhisper: boolean;
}

export default function ListeningIndicator({ incomingWhisper }: ListeningIndicatorProps) {
    const opacity = useRef(new RNAnimated.Value(0)).current;
    const translateY = useRef(new RNAnimated.Value(10)).current;
    const scale = useRef(new RNAnimated.Value(0.95)).current;
    const dotPulse = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        if (incomingWhisper) {
            RNAnimated.parallel([
                RNAnimated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                RNAnimated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }),
                RNAnimated.spring(scale, { toValue: 1, friction: 8, useNativeDriver: true }),
            ]).start();

            // Pulse dot
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(dotPulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
                    RNAnimated.timing(dotPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            RNAnimated.parallel([
                RNAnimated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
                RNAnimated.timing(translateY, { toValue: 10, duration: 150, useNativeDriver: true }),
                RNAnimated.timing(scale, { toValue: 0.95, duration: 150, useNativeDriver: true }),
            ]).start();
            dotPulse.stopAnimation();
        }
    }, [incomingWhisper]);

    if (!incomingWhisper) return null;

    return (
        <RNAnimated.View style={[styles.container, { opacity, transform: [{ translateY }, { scale }] }]}>
            <View style={styles.pill}>
                <RNAnimated.View style={[styles.dot, { opacity: dotPulse }]} />
                <View>
                    <Text style={styles.textTop}>TRANSMISSION</Text>
                    <Text style={styles.textBottom}>RECEIVED</Text>
                </View>
            </View>
        </RNAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 90,
        right: 16,
        zIndex: 30,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(15, 17, 20, 0.95)',
        borderWidth: 1,
        borderColor: THEME.accEmerald,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 99,
        backgroundColor: THEME.accEmerald,
    },
    textTop: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 9 * 0.12,
        color: THEME.accEmerald,
        textTransform: 'uppercase',
    },
    textBottom: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.10,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
});
