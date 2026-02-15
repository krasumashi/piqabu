import React, { useRef, useEffect } from 'react';
import { View, Image, Text, Modal, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PeepDeck({
    remoteImage, visible, onClose
}: {
    remoteImage: string | null;
    visible: boolean;
    onClose: () => void;
}) {
    const slideAnim = useRef(new Animated.Value(600)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0, tension: 50, friction: 10, useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1, duration: 250, useNativeDriver: true,
                }),
            ]).start();
        } else {
            slideAnim.setValue(600);
            fadeAnim.setValue(0);
        }
    }, [visible]);

    return (
        <Modal visible={visible} animationType="none" transparent>
            <Animated.View style={{ flex: 1, opacity: fadeAnim }} className="bg-void/95">
                <Animated.View
                    style={{ flex: 1, transform: [{ translateY: slideAnim }] }}
                    className="justify-center p-6"
                >
                    <View className="flex-row justify-between items-center mb-6">
                        <View>
                            <Text className="text-signal font-mono text-xs tracking-[2px] uppercase font-bold">
                                Peep Room
                            </Text>
                            <Text className="text-ghost font-mono text-[8px] uppercase tracking-[1px]">
                                View Only {'\u2022'} No Trace
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            activeOpacity={0.7}
                            className="flex-row items-center border border-ghost/30 rounded-full px-3 py-1.5"
                        >
                            <Ionicons name="eye-off-outline" size={14} color="#555" />
                            <Text className="text-ghost font-mono text-[8px] ml-1.5 uppercase tracking-[1px]">
                                Fold Shut
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 border border-ghost/30 rounded-2xl overflow-hidden bg-black items-center justify-center">
                        {remoteImage ? (
                            <>
                                <Image
                                    source={{ uri: remoteImage }}
                                    className="w-full h-full"
                                    resizeMode="contain"
                                />
                                <View className="absolute bottom-6 bg-void/80 px-4 py-2 border border-signal/30 rounded-full">
                                    <Text className="text-signal font-mono text-[10px] uppercase tracking-[1px]">
                                        Partner is Exposing...
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <View className="items-center">
                                <Ionicons name="eye-off-outline" size={48} color="#1a1a1a" />
                                <Text className="text-ghost/40 font-mono text-xs uppercase tracking-[2px] mt-4">
                                    Nothing Exposed... Yet
                                </Text>
                            </View>
                        )}
                    </View>

                    <Text className="text-ghost/30 font-mono text-[7px] text-center mt-6 uppercase tracking-[1px]">
                        You didn't see this.
                    </Text>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}
