import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFirstLaunch } from '../lib/onboarding/useFirstLaunch';
import { useRoomContext } from '../contexts/RoomContext';
import SubscriptionBadge from '../components/SubscriptionBadge';
import Paywall from '../components/Paywall';

export default function SignalTower() {
    const router = useRouter();
    const { deviceId, requestRoomCode, addRoom, isConnected, tier, refreshSubscription } = useRoomContext();
    const { isFirstLaunch } = useFirstLaunch();
    const [roomCode, setRoomCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);

    // Redirect to onboarding on first launch
    useEffect(() => {
        if (isFirstLaunch === true) {
            router.replace('/onboarding');
        }
    }, [isFirstLaunch]);

    // Check for subscription success redirect (web Stripe checkout)
    useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('subscription') === 'success') {
                refreshSubscription();
                // Clean up URL
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }, []);

    const generateCode = async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const code = await requestRoomCode();
            const result = addRoom(code);
            if (result.success) {
                router.push('/room');
            } else {
                setShowPaywall(true);
            }
        } catch (e) {
            Alert.alert('Error', 'Unable to generate room code. Check your connection.');
        } finally {
            setIsGenerating(false);
        }
    };

    const joinRoom = () => {
        if (roomCode.length === 6) {
            const result = addRoom(roomCode.toUpperCase());
            if (result.success) {
                router.push('/room');
            } else {
                setShowPaywall(true);
            }
        }
    };

    const handleSubscribed = async () => {
        await refreshSubscription();
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-void"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View className="flex-1 items-center justify-center p-8">
                    {/* Top Row: Badge + Connection */}
                    <View className="absolute top-14 left-6">
                        <SubscriptionBadge tier={tier} onPress={() => setShowPaywall(true)} />
                    </View>
                    <View className="absolute top-14 right-6">
                        <View className={`w-2 h-2 rounded-full ${isConnected ? 'bg-signal' : 'bg-destruct'}`} />
                    </View>

                    {/* Signal Tower Icon */}
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
                            disabled={isGenerating}
                            className={`p-4 rounded-xl border border-signal ${isGenerating ? 'opacity-50' : ''}`}
                        >
                            <Text className="text-signal text-center font-mono font-bold uppercase tracking-[2px]">
                                {isGenerating ? 'Initializing...' : 'Initialize Handshake'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text className="absolute bottom-8 text-ghost font-mono text-[8px] uppercase tracking-[1px]">
                        No Accounts. No History. Zero Trace.
                    </Text>
                </View>
            </ScrollView>

            {/* Paywall */}
            <Paywall
                visible={showPaywall}
                feature="multi_room"
                onDismiss={() => setShowPaywall(false)}
                deviceId={deviceId}
                onSubscribed={handleSubscribed}
            />

            <StatusBar style="light" />
        </KeyboardAvoidingView>
    );
}
