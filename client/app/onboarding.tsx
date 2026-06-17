import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, FlatList, Animated, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFirstLaunch } from '../lib/onboarding/useFirstLaunch';
import GridBackground from '../components/GridBackground';
import PiqabuProPaywall from '../components/PiqabuProPaywall';
import { useProAccess } from '../lib/pro';
import KeyboardFeaturesSlide from '../components/KeyboardFeaturesSlide';
import FeatureGuide from '../components/FeatureGuide';

const { width } = Dimensions.get('window');

interface KeyboardFeature {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
}

interface Slide {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    description: string;
    /**
     * If set, renders an in-slide action button above the bottom Next/Finish
     * CTA. Used by the keyboard slide to deep-link into the Android system
     * Input Method Settings screen.
     */
    cta?: 'enable_keyboard';
    /** Slide layout variant. 'features' renders a stacked feature-list with
     *  staggered entrance animation instead of the centered icon layout. */
    kind?: 'standard' | 'features';
    /** Feature rows for the 'features' kind. */
    features?: KeyboardFeature[];
}

/**
 * Open the Android system IME settings screen so the user can toggle
 * the Piqabu Keyboard on. No-op on iOS/web for v1 (we ship iOS later
 * via Share Extension + Shortcuts).
 */
function openKeyboardSettings() {
    if (Platform.OS !== 'android') return;
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(() => {
        // Fall back to general settings if the specific action fails
        // on older Android versions or oddball OEMs.
        Linking.openSettings().catch(() => {});
    });
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
        description: 'Type and watch your correspondent read every character as it appears. Ephemeral by design -- text can vanish on a timer.',
    },
    {
        icon: 'eye-outline',
        title: 'REVEAL & PEEK',
        subtitle: 'Controlled exposure',
        description: 'Load material into your Reveal Vault. Show it when you choose. Your correspondent sees it in their Peek Room -- no screenshots, no trace.',
    },
    {
        icon: 'radio-outline',
        title: 'WHISPER & GLASS',
        subtitle: 'Voice-distorted audio + live camera',
        description: 'Hold to transmit a voice-altered message. Toggle Live Glass for an obscured camera feed with privacy blur and noir filters.',
    },
    {
        icon: 'keypad-outline',
        title: 'PIQABU KEYBOARD',
        subtitle: 'Private channels, one key away',
        description: 'Add the Piqabu Keyboard so you can summon a private channel from inside any chat app -- WhatsApp, Telegram, anywhere you type.',
    },
    {
        icon: 'shield-checkmark-outline',
        title: 'WHAT IT DOES',
        subtitle: 'Six silent privacy features',
        description: '',
        kind: 'features',
        cta: 'enable_keyboard',
        features: [
            {
                icon: 'send-outline',
                title: 'MINT FROM ANYWHERE',
                desc: 'Generate a private channel from any text field — WhatsApp, Telegram, anywhere.',
            },
            {
                icon: 'eye-off-outline',
                title: 'ZERO TRACE TYPING',
                desc: 'No keystrokes leave your device. No suggestions, no learning, no cloud uploads.',
            },
            {
                icon: 'finger-print-outline',
                title: 'QUICK-LOCK',
                desc: 'Triple-tap the globe to lock the keyboard behind your device biometric.',
            },
            {
                icon: 'swap-horizontal-outline',
                title: 'DECOY SEND',
                desc: 'Long-press Return to insert a plausible decoy phrase under pressure.',
            },
            {
                icon: 'flash-outline',
                title: 'ONE-TAP RECONNECT',
                desc: 'The OPEN button brings up the Piqabu app to the waiting room in a single tap.',
            },
            {
                icon: 'lock-closed-outline',
                title: 'PRIVATE BY DEFAULT',
                desc: 'No autocorrect, no candidates strip, no clipboard leaks. The keyboard never phones home.',
            },
        ],
    },
];

export default function Onboarding() {
    const router = useRouter();
    const { completeOnboarding } = useFirstLaunch();
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const { isPro, refresh: refreshPro } = useProAccess();
    const [paywallVisible, setPaywallVisible] = useState(false);
    const [showFeatureGuide, setShowFeatureGuide] = useState(false);

    const handleNext = () => {
        if (activeIndex < slides.length - 1) {
            flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
        } else {
            handleFinish();
        }
    };

    // Completing the flow opens the Feature Guide once, so new users
    // learn what each tool does before entering. Closing it drops them
    // into the app. The guide still lives in Settings for later.
    const handleFinish = async () => {
        await completeOnboarding();
        setShowFeatureGuide(true);
    };

    // Skip bypasses the guide — straight into the app.
    const handleSkip = async () => {
        await completeOnboarding();
        router.replace('/');
    };

    const renderSlide = ({ item, index }: { item: Slide; index: number }) => {
        if (item.kind === 'features' && item.features) {
            return (
                <KeyboardFeaturesSlide
                    item={item}
                    active={index === activeIndex}
                    onCtaPress={() => {
                        if (Platform.OS !== 'android') return;
                        if (isPro) openKeyboardSettings();
                        else setPaywallVisible(true);
                    }}
                    isPro={isPro}
                />
            );
        }
        return (
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

            {/* In-slide CTA — gated on Pro tier (pseudo paywall for now). */}
            {item.cta === 'enable_keyboard' && (
                <TouchableOpacity
                    onPress={() => {
                        if (Platform.OS !== 'android') return;
                        if (isPro) {
                            openKeyboardSettings();
                        } else {
                            setPaywallVisible(true);
                        }
                    }}
                    activeOpacity={0.75}
                    style={{
                        marginTop: 28,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderWidth: 1,
                        borderColor: '#FFFFFF',
                        borderRadius: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <Ionicons
                        name={Platform.OS !== 'android' ? 'phone-portrait-outline' : (isPro ? 'add-circle-outline' : 'lock-closed-outline')}
                        size={16}
                        color="#FFFFFF"
                    />
                    <Text
                        className="text-signal font-mono font-bold uppercase"
                        style={{ letterSpacing: 2, fontSize: 11 }}
                    >
                        {Platform.OS !== 'android'
                            ? 'Android only for now'
                            : (isPro ? 'Enable Piqabu Keyboard' : 'Unlock with Piqabu Pro')}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
        );
    };

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
        }
    }).current;

    return (
        <View className="flex-1" style={{ backgroundColor: '#060709' }}>
            <GridBackground />
            {/* Skip button */}
            <TouchableOpacity
                onPress={handleSkip}
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

            {/* Pseudo paywall — tap "Subscribe" sets pro flag locally. */}
            <PiqabuProPaywall
                visible={paywallVisible}
                onDismiss={() => setPaywallVisible(false)}
                onSubscribed={() => { refreshPro(); }}
            />

            {/* Feature Guide — auto-opened once at the end of onboarding so
                users learn each tool before entering. Closing it drops them
                into the app. Also lives in Settings for later reference. */}
            <FeatureGuide
                visible={showFeatureGuide}
                onClose={() => { setShowFeatureGuide(false); router.replace('/'); }}
            />
        </View>
    );
}
