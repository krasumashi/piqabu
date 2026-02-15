import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Animated, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-linking';

interface SettingsPanelProps {
    visible: boolean;
    onClose: () => void;
    roomId: string;
    linkStatus: string;
    onRegenerateKey: () => void;
    onLeaveChannel: () => void;
}

export default function SettingsPanel({
    visible, onClose, roomId, linkStatus, onRegenerateKey, onLeaveChannel,
}: SettingsPanelProps) {
    const slideAnim = useRef(new Animated.Value(300)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 11,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 300,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const handleShareKey = async () => {
        if (Platform.OS === 'web') {
            try {
                await navigator.clipboard.writeText(roomId);
            } catch {
                // Fallback: select text
            }
        } else {
            try {
                await Share.share({ message: `Join my Piqabu session: ${roomId}` });
            } catch {}
        }
    };

    const isLive = linkStatus === 'LINKED';

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="none" transparent>
            <Animated.View
                style={{ flex: 1, opacity: fadeAnim }}
                className="bg-void/95"
            >
                <View className="flex-1 justify-start pt-20 px-6">
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-8">
                        <Text className="text-signal font-mono text-sm tracking-[4px] uppercase font-bold">
                            Settings
                        </Text>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                            <Text className="text-ghost font-mono text-xs tracking-[2px] uppercase">Close</Text>
                        </TouchableOpacity>
                    </View>

                    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
                        {/* Channel Key */}
                        <View className="border border-ghost/30 rounded-xl p-4 mb-4 flex-row justify-between items-center">
                            <Text className="text-ghost font-mono text-[10px] uppercase tracking-[2px]">Channel Key</Text>
                            <Text className="text-signal font-mono text-sm font-bold tracking-[2px]">{roomId}</Text>
                        </View>

                        {/* Share Key */}
                        <TouchableOpacity
                            onPress={handleShareKey}
                            activeOpacity={0.7}
                            className="border border-ghost/30 rounded-xl p-4 mb-4 flex-row justify-between items-center"
                        >
                            <Text className="text-ghost font-mono text-[10px] uppercase tracking-[2px]">Share Key</Text>
                            <Ionicons name="link-outline" size={18} color="#333" />
                        </TouchableOpacity>

                        {/* Status */}
                        <View className="border border-ghost/30 rounded-xl p-4 mb-4 flex-row justify-between items-center">
                            <Text className="text-ghost font-mono text-[10px] uppercase tracking-[2px]">Status</Text>
                            <Text className={`font-mono text-xs font-bold tracking-[2px] ${isLive ? 'text-signal' : 'text-amber'}`}>
                                {isLive ? 'LIVE' : 'WAITING'}
                            </Text>
                        </View>

                        {/* Regenerate Key */}
                        <TouchableOpacity
                            onPress={onRegenerateKey}
                            activeOpacity={0.7}
                            className="border border-ghost/30 rounded-xl p-4 mb-4 flex-row justify-between items-center"
                        >
                            <Text className="text-ghost font-mono text-[10px] uppercase tracking-[2px]">Regenerate Key</Text>
                            <Ionicons name="refresh-outline" size={18} color="#333" />
                        </TouchableOpacity>

                        {/* Leave Channel */}
                        <TouchableOpacity
                            onPress={onLeaveChannel}
                            activeOpacity={0.7}
                            className="border border-destruct/40 rounded-xl p-4 flex-row justify-between items-center"
                        >
                            <Text className="text-destruct font-mono text-[10px] uppercase tracking-[2px]">Leave Channel</Text>
                            <Ionicons name="log-out-outline" size={18} color="#FF453A" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Footer */}
                    <View className="flex-1 justify-end pb-12">
                        <Text className="text-ghost/50 font-mono text-[8px] text-center uppercase tracking-[2px]">
                            Micro: No Accounts. No History.
                        </Text>
                    </View>
                </View>
            </Animated.View>
        </Modal>
    );
}
