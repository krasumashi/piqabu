import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { usePiqabu } from '../hooks/usePiqabu';
import { StatusBar } from 'expo-status-bar';

export default function SignalTower() {
    const router = useRouter();
    const { deviceId } = usePiqabu();
    const [roomCode, setRoomCode] = useState('');

    const generateCode = () => {
        // Generate a 6-char alphanumeric code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        router.push(`/room/${code}`);
    };

    const joinRoom = () => {
        if (roomCode.length === 6) {
            router.push(`/room/${roomCode.toUpperCase()}`);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-void"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View className="flex-1 items-center justify-center p-8">
                    {/* Signal Tower Icon / Animation Placeholder */}
                    <View className="w-24 h-24 border-2 border-signal rounded-full items-center justify-center mb-8">
                        <View className="w-16 h-16 border border-signal/50 rounded-full animate-pulse" />
                        <View className="absolute w-1 h-1 bg-signal rounded-full" />
                    </View>

                    <Text className="text-signal font-mono text-xs tracking-[4px] mb-2 uppercase text-center">
                        Establishing Identity...
                    </Text>
                    <Text className="text-ghost font-mono text-[10px] mb-12 uppercase text-center">
                        ID: {deviceId?.substring(0, 18)}...
                    </Text>

                    <View className="w-full space-y-6">
                        <View>
                            <Text className="text-ghost font-mono text-[10px] mb-2 uppercase tracking-[2px]">
                                Input Frequency
                            </Text>
                            <TextInput
                                value={roomCode}
                                onChangeText={(val) => setRoomCode(val.toUpperCase())}
                                placeholder="_ _ _ _ _ _"
                                placeholderTextColor="#333"
                                className="bg-ghost/10 border border-ghost p-4 text-signal font-mono text-2xl text-center rounded-xl"
                                maxLength={6}
                                autoCapitalize="characters"
                                autoCorrect={false}
                            />
                        </View>

                        <TouchableOpacity
                            onPress={joinRoom}
                            disabled={roomCode.length !== 6}
                            className={`p-4 rounded-xl border ${roomCode.length === 6 ? 'bg-signal border-signal' : 'border-ghost opacity-50'}`}
                        >
                            <Text className={`text-center font-mono font-bold uppercase tracking-[2px] ${roomCode.length === 6 ? 'text-void' : 'text-ghost'}`}>
                                Join Frequency
                            </Text>
                        </TouchableOpacity>

                        <View className="flex-row items-center my-4">
                            <View className="flex-1 h-[1px] bg-ghost/30" />
                            <Text className="text-ghost font-mono text-[10px] mx-4 uppercase">OR</Text>
                            <View className="flex-1 h-[1px] bg-ghost/30" />
                        </View>

                        <TouchableOpacity
                            onPress={generateCode}
                            className="p-4 rounded-xl border border-signal"
                        >
                            <Text className="text-signal text-center font-mono font-bold uppercase tracking-[2px]">
                                Initialize Handshake
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text className="absolute bottom-8 text-ghost font-mono text-[8px] uppercase tracking-[1px]">
                        No Accounts. No History. Zero Trace.
                    </Text>
                </View>
            </ScrollView>
            <StatusBar style="light" />
        </KeyboardAvoidingView>
    );
}
