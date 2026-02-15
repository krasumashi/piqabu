import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { getSecureItem, setSecureItem } from '../lib/platform/storage';

interface FeatureTooltipProps {
    featureKey: string;
    text: string;
    position?: 'above' | 'below';
    children: React.ReactNode;
}

export default function FeatureTooltip({
    featureKey,
    text,
    position = 'above',
    children,
}: FeatureTooltipProps) {
    const [visible, setVisible] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(position === 'above' ? 10 : -10)).current;
    const scale = useRef(new Animated.Value(0.85)).current;

    useEffect(() => {
        const key = `tooltip_seen_${featureKey}`;
        getSecureItem(key).then((val) => {
            if (val !== 'true') {
                setVisible(true);
                // Bounce-in with slight delay for stagger effect
                setTimeout(() => {
                    Animated.parallel([
                        Animated.spring(opacity, {
                            toValue: 1, friction: 8, tension: 40, useNativeDriver: true,
                        }),
                        Animated.spring(translateY, {
                            toValue: 0, friction: 6, tension: 50, useNativeDriver: true,
                        }),
                        Animated.spring(scale, {
                            toValue: 1, friction: 5, tension: 60, useNativeDriver: true,
                        }),
                    ]).start();
                }, 800); // Delay after mount so user sees the UI first
            }
        });
    }, [featureKey]);

    const dismiss = async () => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0, duration: 150, useNativeDriver: true,
            }),
            Animated.timing(scale, {
                toValue: 0.85, duration: 150, useNativeDriver: true,
            }),
        ]).start(() => {
            setVisible(false);
        });
        await setSecureItem(`tooltip_seen_${featureKey}`, 'true');
    };

    return (
        <View>
            {visible && (
                <TouchableOpacity
                    onPress={dismiss}
                    activeOpacity={0.9}
                    style={{
                        position: 'absolute',
                        zIndex: 100,
                        left: -40,
                        right: -40,
                        ...(position === 'above' ? { bottom: '110%' } : { top: '110%' }),
                    }}
                >
                    <Animated.View
                        style={{
                            opacity,
                            transform: [{ translateY }, { scale }],
                        }}
                        className="bg-signal/90 px-3 py-2 rounded-lg"
                    >
                        <Text className="text-void font-mono text-[9px] uppercase tracking-[1px] text-center">
                            {text}
                        </Text>
                        <Text className="text-void/60 font-mono text-[7px] uppercase text-center mt-1">
                            Tap to dismiss
                        </Text>
                    </Animated.View>
                </TouchableOpacity>
            )}
            {children}
        </View>
    );
}
