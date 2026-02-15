import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFirstLaunch } from '../lib/onboarding/useFirstLaunch';
import { useRoomContext } from '../contexts/RoomContext';
import SubscriptionBadge from '../components/SubscriptionBadge';
import Paywall from '../components/Paywall';

// ─── Staggered fade-in component ───
function FadeInView({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(translateY, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start();
        }, delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
            {children}
        </Animated.View>
    );
}

// ─── Pulsing ring component ───
function PulsingRing() {
    const outerPulse = useRef(new Animated.Value(1)).current;
    const innerPulse = useRef(new Animated.Value(0.5)).current;
    const dotPulse = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        // Outer ring breathe
        Animated.loop(
            Animated.sequence([
                Animated.timing(outerPulse, { toValue: 1.06, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(outerPulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        ).start();

        // Inner ring opacity breathe
        Animated.loop(
            Animated.sequence([
                Animated.timing(innerPulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(innerPulse, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        ).start();

        // Center dot pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(dotPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(dotPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={{ transform: [{ scale: outerPulse }] }}
            className="w-24 h-24 border-2 border-signal rounded-full items-center justify-center mb-8"
        >
            <Animated.View
                style={{ opacity: innerPulse }}
                className="w-16 h-16 border border-signal/50 rounded-full"
            />
            <Animated.View
                style={{ opacity: dotPulse }}
                className="absolute w-2 h-2 bg-signal rounded-full"
            />
        </Animated.View>
    );
}

export default function SignalTower() {
    const router = useRouter();
    const { deviceId, requestRoomCode, addRoom, isConnected, tier, refreshSubscription } = useRoomContext();
    const { isFirstLaunch } = useFirstLaunch();
    const [roomCode, setRoomCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);

    // Button scale animations
    const joinScale = useRef(new Animated.Value(1)).current;
    const initScale = useRef(new Animated.Value(1)).current;

    const pressIn = (anim: Animated.Value) => Animated.spring(anim, { toValue: 0.95, friction: 5, useNativeDriver: true }).start();
    const pressOut = (anim: Animated.Value) => Animated.spring(anim, { toValue: 1, friction: 5, useNativeDriver: true }).start();

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
                    <FadeInView delay={100} style={{ position: 'absolute', top: 56, left: 24 }}>
                        <SubscriptionBadge tier={tier} onPress={() => setShowPaywall(true)} />
                    </FadeInView>
                    <FadeInView delay={100} style={{ position: 'absolute', top: 56, right: 24 }}>
                        <View className={`w-2 h-2 rounded-full ${isConnected ? 'bg-signal' : 'bg-destruct'}`} />
                    </FadeInView>

                    {/* Signal Tower Icon */}
                    <FadeInView delay={200}>
                        <PulsingRing />
                    </FadeInView>

                    <FadeInView delay={400}>
                        <Text className="text-signal font-mono text-xs tracking-[4px] mb-2 uppercase text-center">
                            Establishing Identity...
                        </Text>
                    </FadeInView>
                    <FadeInView delay={500}>
                        <Text className="text-ghost font-mono text-[10px] mb-12 uppercase text-center">
                            ID: {deviceId?.substring(0, 18)}...
                        </Text>
                    </FadeInView>

                    <View className="w-full">
                        <FadeInView delay={600}>
                            <View className="mb-6">
                                <Text className="text-ghost font-mono text-[10px] mb-2 uppercase tracking-[2px]">
                                    Input Frequency
                                </Text>
                                <TextInput
                                    value={roomCode}
                                    onChangeText={(val) => setRoomCode(val.toUpperCase())}
                                    placeholder="_ _ _ _ _ _"
                                    placeholderTextColor="#333"
                                    className="bg-ghost/10 border border-ghost/40 p-4 text-signal font-mono text-2xl text-center rounded-xl"
                                    maxLength={6}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                />
                            </View>
                        </FadeInView>

                        <FadeInView delay={700}>
                            <Animated.View style={{ transform: [{ scale: joinScale }] }}>
                                <TouchableOpacity
                                    onPress={joinRoom}
                                    onPressIn={() => pressIn(joinScale)}
                                    onPressOut={() => pressOut(joinScale)}
                                    disabled={roomCode.length !== 6}
                                    className={`p-4 rounded-xl border mb-6 ${roomCode.length === 6 ? 'bg-signal border-signal' : 'border-ghost/30 opacity-50'}`}
                                >
                                    <Text className={`text-center font-mono font-bold uppercase tracking-[2px] ${roomCode.length === 6 ? 'text-void' : 'text-ghost'}`}>
                                        Join Frequency
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </FadeInView>

                        <FadeInView delay={800}>
                            <View className="flex-row items-center my-2 mb-4">
                                <View className="flex-1 h-[1px] bg-ghost/20" />
                                <Text className="text-ghost/40 font-mono text-[10px] mx-4 uppercase">OR</Text>
                                <View className="flex-1 h-[1px] bg-ghost/20" />
                            </View>
                        </FadeInView>

                        <FadeInView delay={900}>
                            <Animated.View style={{ transform: [{ scale: initScale }] }}>
                                <TouchableOpacity
                                    onPress={generateCode}
                                    onPressIn={() => pressIn(initScale)}
                                    onPressOut={() => pressOut(initScale)}
                                    disabled={isGenerating}
                                    className={`p-4 rounded-xl border border-signal ${isGenerating ? 'opacity-50' : ''}`}
                                >
                                    <Text className="text-signal text-center font-mono font-bold uppercase tracking-[2px]">
                                        {isGenerating ? 'Initializing...' : 'Initialize Handshake'}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </FadeInView>
                    </View>

                    <FadeInView delay={1100} style={{ position: 'absolute', bottom: 32 }}>
                        <Text className="text-ghost/30 font-mono text-[8px] uppercase tracking-[1px] text-center">
                            No Accounts. No History. Zero Trace.
                        </Text>
                    </FadeInView>
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
