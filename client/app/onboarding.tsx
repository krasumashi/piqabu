import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, FlatList, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFirstLaunch } from '../lib/onboarding/useFirstLaunch';

const { width } = Dimensions.get('window');

interface Slide {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    description: string;
}

const slides: Slide[] = [
    {
        icon: 'lock-closed-outline',
        title: 'ZERO TRACE',
        subtitle: 'No accounts. No history.',
        description: 'Your identity is a ghost ID generated on-device. Nothing is stored on any server. When the session ends, everything vanishes.',
    },
    {
        icon: 'sync-outline',
        title: 'LIVE SYNC',
        subtitle: 'Real-time text transmission',
        description: 'Type and watch your co-conspirator see every character as it appears. Ephemeral by design -- text can vanish on a timer.',
    },
    {
        icon: 'eye-outline',
        title: 'REVEAL & PEEP',
        subtitle: 'Controlled exposure',
        description: 'Load evidence into your Reveal Vault. Expose it when you choose. Your partner sees it in their Peep Room -- no screenshots, no trace.',
    },
    {
        icon: 'radio-outline',
        title: 'WHISPER & GLASS',
        subtitle: 'Voice-distorted audio + live camera',
        description: 'Hold to transmit a voice-altered message. Toggle Live Glass for an obscured camera feed with privacy blur and noir filters.',
    },
];

export default function Onboarding() {
    const router = useRouter();
    const { completeOnboarding } = useFirstLaunch();
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const handleNext = () => {
        if (activeIndex < slides.length - 1) {
            flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
        } else {
            handleFinish();
        }
    };

    const handleFinish = async () => {
        await completeOnboarding();
        router.replace('/');
    };

    const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
        <View style={{ width }} className="flex-1 items-center justify-center p-8">
            {/* Animated Icon */}
            <View className="w-28 h-28 border-2 border-signal/40 rounded-full items-center justify-center mb-10">
                <View className="w-20 h-20 border border-signal/20 rounded-full items-center justify-center">
                    <Ionicons name={item.icon} size={36} color="#FFFFFF" />
                </View>
            </View>

            <Text className="text-signal font-mono text-lg tracking-[4px] mb-2 uppercase text-center font-bold">
                {item.title}
            </Text>

            <Text className="text-amber font-mono text-[10px] tracking-[2px] mb-8 uppercase text-center">
                {item.subtitle}
            </Text>

            <Text className="text-ghost font-mono text-xs text-center leading-5 px-4">
                {item.description}
            </Text>
        </View>
    );

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
        }
    }).current;

    return (
        <View className="flex-1" style={{ backgroundColor: '#060709' }}>
            {/* Skip button */}
            <TouchableOpacity
                onPress={handleFinish}
                className="absolute top-14 right-6 z-10 px-4 py-2"
            >
                <Text className="text-ghost font-mono text-[10px] uppercase tracking-[2px]">
                    Skip
                </Text>
            </TouchableOpacity>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={slides}
                renderItem={renderSlide}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
                keyExtractor={(_, i) => i.toString()}
            />

            {/* Bottom Controls */}
            <View className="pb-12 px-8">
                {/* Dots */}
                <View className="flex-row justify-center mb-8">
                    {slides.map((_, i) => (
                        <View
                            key={i}
                            className={`w-2 h-2 rounded-full mx-1 ${
                                i === activeIndex ? 'bg-signal' : 'bg-ghost/30'
                            }`}
                        />
                    ))}
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                    onPress={handleNext}
                    className={`p-4 rounded-xl border ${
                        activeIndex === slides.length - 1
                            ? 'bg-signal border-signal'
                            : 'border-signal'
                    }`}
                >
                    <Text
                        className={`text-center font-mono font-bold uppercase tracking-[2px] ${
                            activeIndex === slides.length - 1
                                ? 'text-void'
                                : 'text-signal'
                        }`}
                    >
                        {activeIndex === slides.length - 1
                            ? 'Enter Signal Tower'
                            : 'Next'}
                    </Text>
                </TouchableOpacity>
            </View>

            <StatusBar style="light" />
        </View>
    );
}
