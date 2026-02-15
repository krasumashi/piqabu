import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Tier } from '../lib/subscription/tiers';

interface SubscriptionBadgeProps {
    tier: Tier;
    onPress?: () => void;
}

export default function SubscriptionBadge({ tier, onPress }: SubscriptionBadgeProps) {
    if (tier === 'pro') {
        return (
            <View className="bg-signal/20 px-3 py-1 rounded-full">
                <Text className="text-signal font-mono text-[8px] font-bold uppercase tracking-[1px]">
                    Pro
                </Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            className="bg-ghost/10 border border-ghost/30 px-3 py-1 rounded-full"
        >
            <Text className="text-ghost font-mono text-[8px] uppercase tracking-[1px]">
                Free
            </Text>
        </TouchableOpacity>
    );
}
