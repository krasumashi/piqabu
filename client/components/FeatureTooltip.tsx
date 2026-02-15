import React, { useState, useEffect } from 'react';
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
    const opacity = useState(new Animated.Value(0))[0];

    useEffect(() => {
        const key = `tooltip_seen_${featureKey}`;
        getSecureItem(key).then((val) => {
            if (val !== 'true') {
                setVisible(true);
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }).start();
            }
        });
    }, [featureKey]);

    const dismiss = async () => {
        Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
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
                        style={{ opacity }}
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
