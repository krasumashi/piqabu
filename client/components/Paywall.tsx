import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRICING } from '../lib/subscription/tiers';

interface PaywallProps {
    visible: boolean;
    feature: string;
    onDismiss: () => void;
    deviceId: string | null;
    onSubscribed: () => void;
}

const FEATURE_INFO: Record<string, { title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = {
    multi_room: {
        title: 'Multiple Rooms',
        description: 'Run up to 5 simultaneous conversations with different co-conspirators.',
        icon: 'layers-outline',
    },
    live_glass: {
        title: 'Live Glass',
        description: 'Share your obscured camera feed with privacy blur and noir filters.',
        icon: 'eye-outline',
    },
    extended_whisper: {
        title: 'Extended Whisper',
        description: 'Record longer voice-distorted messages up to 60 seconds.',
        icon: 'mic-outline',
    },
    extended_text: {
        title: 'Extended Text',
        description: 'Write longer transmissions up to 10,000 characters.',
        icon: 'text-outline',
    },
};

export default function Paywall({ visible, feature, onDismiss, deviceId, onSubscribed }: PaywallProps) {
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
    const [isPurchasing, setIsPurchasing] = useState(false);

    const info = FEATURE_INFO[feature] || {
        title: 'Pro Feature',
        description: 'Unlock this feature with Piqabu Pro.',
        icon: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
    };

    const handlePurchase = async () => {
        if (isPurchasing || !deviceId) return;
        setIsPurchasing(true);

        try {
            if (Platform.OS === 'web') {
                const { createCheckoutSession, redirectToCheckout } = await import('../lib/subscription/stripe');
                const priceId = selectedPlan === 'monthly' ? PRICING.monthly.id : PRICING.yearly.id;
                const url = await createCheckoutSession(deviceId, priceId);
                if (url) {
                    redirectToCheckout(url);
                } else {
                    Alert.alert('Error', 'Unable to start checkout. Try again.');
                }
            } else {
                const { purchasePackage } = await import('../lib/subscription/revenueCat');
                const packageId = selectedPlan === 'monthly' ? PRICING.monthly.id : PRICING.yearly.id;
                const success = await purchasePackage(packageId);
                if (success) {
                    onSubscribed();
                    onDismiss();
                }
            }
        } catch (e) {
            console.error('[Paywall] Purchase error:', e);
            Alert.alert('Error', 'Purchase failed. Please try again.');
        } finally {
            setIsPurchasing(false);
        }
    };

    const handleRestore = async () => {
        if (Platform.OS === 'web') return;

        try {
            const { restorePurchases } = await import('../lib/subscription/revenueCat');
            const tier = await restorePurchases();
            if (tier === 'pro') {
                onSubscribed();
                onDismiss();
            } else {
                Alert.alert('No Active Subscription', 'No previous Pro subscription found.');
            }
        } catch (e) {
            Alert.alert('Error', 'Unable to restore purchases.');
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 justify-end">
                <View className="bg-void border-t border-signal/30 p-6 rounded-t-3xl" style={{ paddingBottom: 40 }}>
                    {/* Close */}
                    <TouchableOpacity onPress={onDismiss} className="absolute top-4 right-4 z-10 p-2">
                        <Ionicons name="close-outline" size={28} color="#333" />
                    </TouchableOpacity>

                    {/* Feature Icon */}
                    <View className="items-center mb-6">
                        <View className="w-16 h-16 border-2 border-signal/40 rounded-full items-center justify-center mb-4">
                            <Ionicons name={info.icon} size={28} color="#00FF9D" />
                        </View>
                        <Text className="text-signal font-mono text-sm tracking-[3px] uppercase font-bold">
                            {info.title}
                        </Text>
                        <Text className="text-ghost font-mono text-[10px] text-center mt-2 px-4">
                            {info.description}
                        </Text>
                    </View>

                    {/* Pro Benefits */}
                    <View className="bg-signal/5 border border-signal/20 rounded-xl p-4 mb-6">
                        <Text className="text-signal font-mono text-[10px] uppercase tracking-[2px] mb-3 font-bold">
                            Piqabu Pro Includes
                        </Text>
                        {['5 Simultaneous Rooms', 'Live Glass Camera', '60s Whisper Messages', '10 Reveal Images', '10K Character Limit'].map((benefit, i) => (
                            <View key={i} className="flex-row items-center mb-2">
                                <Ionicons name="checkmark-circle" size={14} color="#00FF9D" />
                                <Text className="text-ghost font-mono text-[10px] ml-2">{benefit}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Plan Toggle */}
                    <View className="flex-row mb-4">
                        <TouchableOpacity
                            onPress={() => setSelectedPlan('monthly')}
                            className={`flex-1 p-3 rounded-l-xl border ${
                                selectedPlan === 'monthly'
                                    ? 'border-signal bg-signal/10'
                                    : 'border-ghost/30 bg-void'
                            }`}
                        >
                            <Text className={`font-mono text-[10px] text-center uppercase ${
                                selectedPlan === 'monthly' ? 'text-signal font-bold' : 'text-ghost'
                            }`}>
                                Monthly
                            </Text>
                            <Text className={`font-mono text-sm text-center mt-1 ${
                                selectedPlan === 'monthly' ? 'text-signal' : 'text-ghost'
                            }`}>
                                {PRICING.monthly.price}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setSelectedPlan('yearly')}
                            className={`flex-1 p-3 rounded-r-xl border-t border-b border-r ${
                                selectedPlan === 'yearly'
                                    ? 'border-signal bg-signal/10'
                                    : 'border-ghost/30 bg-void'
                            }`}
                        >
                            <View className="flex-row justify-center items-center">
                                <Text className={`font-mono text-[10px] text-center uppercase ${
                                    selectedPlan === 'yearly' ? 'text-signal font-bold' : 'text-ghost'
                                }`}>
                                    Yearly
                                </Text>
                                <View className="bg-signal/20 px-2 py-0.5 rounded-full ml-2">
                                    <Text className="text-signal font-mono text-[8px] font-bold">-{PRICING.yearly.savings}</Text>
                                </View>
                            </View>
                            <Text className={`font-mono text-sm text-center mt-1 ${
                                selectedPlan === 'yearly' ? 'text-signal' : 'text-ghost'
                            }`}>
                                {PRICING.yearly.price}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Subscribe Button */}
                    <TouchableOpacity
                        onPress={handlePurchase}
                        disabled={isPurchasing}
                        className={`p-4 rounded-xl bg-signal border border-signal ${isPurchasing ? 'opacity-50' : ''}`}
                    >
                        {isPurchasing ? (
                            <ActivityIndicator color="#0F1114" />
                        ) : (
                            <Text className="text-void text-center font-mono font-bold uppercase tracking-[2px]">
                                Upgrade to Pro
                            </Text>
                        )}
                    </TouchableOpacity>

                    {/* Restore (native only) */}
                    {Platform.OS !== 'web' && (
                        <TouchableOpacity onPress={handleRestore} className="mt-3">
                            <Text className="text-ghost font-mono text-[10px] text-center uppercase tracking-[1px]">
                                Restore Purchases
                            </Text>
                        </TouchableOpacity>
                    )}

                    <Text className="text-ghost/50 font-mono text-[7px] text-center mt-4">
                        Zero trace philosophy maintained. Subscription status stored by device ID only.
                    </Text>
                </View>
            </View>
        </Modal>
    );
}
