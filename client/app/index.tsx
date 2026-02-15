import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
    Platform, Share, StyleSheet, KeyboardAvoidingView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeIn, FadeOut, FadeInLeft, FadeInRight,
    useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay,
    Easing,
} from 'react-native-reanimated';
import { useRoomContext } from '../contexts/RoomContext';
import { useFirstLaunch } from '../lib/onboarding/useFirstLaunch';
import SubscriptionBadge from '../components/SubscriptionBadge';
import Paywall from '../components/Paywall';
import { THEME, DASHED_BORDER } from '../constants/Theme';

type Mode = 'SPLASH' | 'LANDING' | 'GENERATED';

export default function EntryView() {
    const router = useRouter();
    const { deviceId, requestRoomCode, addRoom, isConnected, tier, refreshSubscription } = useRoomContext();
    const { isFirstLaunch } = useFirstLaunch();
    const [mode, setMode] = useState<Mode>('SPLASH');
    const [roomCode, setRoomCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const [generatedCode, setGeneratedCode] = useState('');

    // Splash animation values
    const splashLogoOpacity = useSharedValue(0);
    const splashLogoScale = useSharedValue(0.9);
    const splashSubOpacity = useSharedValue(0);
    const splashSubY = useSharedValue(10);

    // Button scale animations
    const generateScale = useSharedValue(1);
    const joinScale = useSharedValue(1);

    // Splash → onboarding or LANDING
    useEffect(() => {
        if (isFirstLaunch === null) return;

        if (mode === 'SPLASH') {
            // Animate splash logo
            splashLogoOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
            splashLogoScale.value = withSpring(1, { damping: 12, stiffness: 90 });
            splashSubOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
            splashSubY.value = withDelay(400, withSpring(0, { damping: 14, stiffness: 100 }));

            const timer = setTimeout(() => {
                if (isFirstLaunch === true) {
                    router.replace('/onboarding');
                } else {
                    setMode('LANDING');
                }
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [isFirstLaunch, mode]);

    // Check for subscription success redirect (web Stripe checkout)
    useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('subscription') === 'success') {
                refreshSubscription();
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }, []);

    const handleGenerate = async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const code = await requestRoomCode();
            setGeneratedCode(code);
            const result = addRoom(code);
            if (result.success) {
                setMode('GENERATED');
            } else {
                setShowPaywall(true);
            }
        } catch (e) {
            Alert.alert('Error', 'Unable to generate session. Check your connection.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleJoin = () => {
        if (roomCode.length === 6) {
            const code = roomCode.toUpperCase();
            const result = addRoom(code);
            if (result.success) {
                router.push('/room');
            } else {
                setShowPaywall(true);
            }
        }
    };

    const handleEnterSession = () => {
        router.push('/room');
    };

    const handleCopy = async () => {
        if (Platform.OS === 'web') {
            try { await navigator.clipboard.writeText(generatedCode); } catch {}
        }
        Alert.alert('Copied', 'Key copied to clipboard');
    };

    const handleShare = async () => {
        if (Platform.OS === 'web') {
            if (navigator.share) {
                navigator.share({ title: 'Piqabu Key', text: `Join my secure channel: ${generatedCode}` }).catch(() => {});
            } else {
                handleCopy();
            }
        } else {
            try {
                await Share.share({ message: `Join my Piqabu session: ${generatedCode}` });
            } catch {}
        }
    };

    const generateAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: generateScale.value }],
    }));
    const joinAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: joinScale.value }],
    }));

    const splashLogoStyle = useAnimatedStyle(() => ({
        opacity: splashLogoOpacity.value,
        transform: [{ scale: splashLogoScale.value }],
    }));
    const splashSubStyle = useAnimatedStyle(() => ({
        opacity: splashSubOpacity.value,
        transform: [{ translateY: splashSubY.value }],
    }));

    // ─── SPLASH MODE ───
    if (mode === 'SPLASH') {
        return (
            <View style={styles.splashContainer}>
                <Animated.Image
                    source={require('../assets/Splash Logotype White.png')}
                    style={[styles.splashLogoImage, splashLogoStyle]}
                    resizeMode="contain"
                />
                <Animated.View style={splashSubStyle}>
                    <Text style={styles.splashSub}>TWO PEOPLE ONLY.</Text>
                    <Text style={styles.splashSub}>NO ACCOUNTS. NO HISTORY.</Text>
                </Animated.View>
                <StatusBar style="light" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.inner}>
                    {/* ─── Top Bar ─── */}
                    <View style={styles.topBar}>
                        <View>
                            <Text style={styles.topBrand}>PIQABU</Text>
                            <Text style={styles.topSub}>DIGITAL PAPER CHANNEL</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <SubscriptionBadge tier={tier} onPress={() => setShowPaywall(true)} />
                            <View style={styles.statusPill}>
                                <View style={[styles.statusDot, { backgroundColor: isConnected ? THEME.live : THEME.warn }]} />
                                <Text style={styles.statusText}>{isConnected ? 'LIVE' : 'WAITING'}</Text>
                            </View>
                        </View>
                    </View>

                    {/* ─── LANDING Mode ─── */}
                    {mode === 'LANDING' && (
                        <Animated.View
                            entering={FadeInLeft.duration(300)}
                            exiting={FadeOut.duration(200)}
                            style={styles.modeContainer}
                        >
                            {/* Hero */}
                            <View style={styles.heroSection}>
                                <Text style={styles.heroTitle}>PIQABU</Text>
                                <Text style={styles.heroSubtitle}>TWO PEOPLE ONLY.</Text>
                                <Text style={styles.heroSubtitle}>NO ACCOUNTS. NO HISTORY.</Text>
                            </View>

                            {/* Generate Button */}
                            <Animated.View style={generateAnimStyle}>
                                <TouchableOpacity
                                    onPress={handleGenerate}
                                    onPressIn={() => { generateScale.value = withSpring(0.96); }}
                                    onPressOut={() => { generateScale.value = withSpring(1); }}
                                    disabled={isGenerating}
                                    style={[styles.generateBtn, isGenerating && { opacity: 0.5 }]}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.generateBtnText}>
                                        {isGenerating ? 'GENERATING...' : 'GENERATE SECURE SESSION'}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>

                            {/* OR Divider */}
                            <View style={styles.orRow}>
                                <View style={styles.orLine} />
                                <Text style={styles.orText}>OR</Text>
                                <View style={styles.orLine} />
                            </View>

                            {/* Join Row */}
                            <View style={styles.joinRow}>
                                <TextInput
                                    value={roomCode}
                                    onChangeText={(val) => setRoomCode(val.toUpperCase())}
                                    placeholder="ENTER KEY"
                                    placeholderTextColor={THEME.faint}
                                    style={styles.joinInput}
                                    maxLength={6}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                />
                                <Animated.View style={joinAnimStyle}>
                                    <TouchableOpacity
                                        onPress={handleJoin}
                                        onPressIn={() => { joinScale.value = withSpring(0.95); }}
                                        onPressOut={() => { joinScale.value = withSpring(1); }}
                                        disabled={roomCode.length !== 6}
                                        style={[styles.joinBtn, roomCode.length !== 6 && { opacity: 0.4 }]}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.joinBtnText}>JOIN</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>

                            {/* Footer */}
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>
                                    BRING ONLY WHAT YOU'RE WILLING TO VANISH.
                                </Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* ─── GENERATED Mode ─── */}
                    {mode === 'GENERATED' && (
                        <Animated.View
                            entering={FadeInRight.duration(300)}
                            exiting={FadeOut.duration(200)}
                            style={styles.modeContainer}
                        >
                            {/* Hero */}
                            <View style={styles.heroSection}>
                                <Text style={styles.generatedTitle}>SESSION MADE</Text>
                                <Text style={styles.generatedSubtitle}>SHARE THE KEY.</Text>
                                <Text style={styles.generatedSubtitle}>WHEN THEY JOIN, YOU GO LIVE.</Text>
                            </View>

                            {/* Key Card */}
                            <View style={styles.keyCard}>
                                <View style={styles.keyCardHeader}>
                                    <Text style={styles.keyCardLabel}>SESSION KEY</Text>
                                    <View style={styles.keyPill}>
                                        <Text style={styles.keyPillText}>{generatedCode}</Text>
                                    </View>
                                </View>

                                <View style={styles.keyCardActions}>
                                    <TouchableOpacity onPress={handleCopy} style={styles.keyActionBtn} activeOpacity={0.7}>
                                        <Text style={styles.keyActionText}>COPY</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleShare} style={styles.keyActionBtn} activeOpacity={0.7}>
                                        <Text style={styles.keyActionText}>SHARE</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.keyCardFooter}>
                                    CO-CONSPIRATORS JOIN WITH THE KEY.
                                </Text>
                            </View>

                            {/* Enter Session */}
                            <TouchableOpacity onPress={handleEnterSession} style={styles.enterBtn} activeOpacity={0.8}>
                                <Text style={styles.enterBtnText}>ENTER SESSION</Text>
                                <Ionicons name="arrow-forward" size={14} color={THEME.ink} />
                            </TouchableOpacity>

                            {/* Back */}
                            <TouchableOpacity
                                onPress={() => setMode('LANDING')}
                                style={styles.backBtn}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="arrow-back" size={12} color={THEME.faint} />
                                <Text style={styles.backText}>BACK</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </View>
            </ScrollView>

            {/* Paywall */}
            <Paywall
                visible={showPaywall}
                feature="multi_room"
                onDismiss={() => setShowPaywall(false)}
                deviceId={deviceId}
                onSubscribed={async () => { await refreshSubscription(); }}
            />

            <StatusBar style="light" />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    // Splash
    splashContainer: {
        flex: 1,
        backgroundColor: THEME.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    splashLogoImage: {
        width: 200,
        height: 70,
        marginBottom: 16,
    },
    splashSub: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.10,
        color: THEME.muted,
        textTransform: 'uppercase',
        textAlign: 'center',
        lineHeight: 16,
    },

    container: {
        flex: 1,
        backgroundColor: THEME.bg,
    },
    scrollContent: {
        flexGrow: 1,
    },
    inner: {
        flex: 1,
        padding: 14,
        gap: 14,
    },

    // ── Top Bar ──
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 6,
        paddingTop: 50,
    },
    topBrand: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 10 * 0.28,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    topSub: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 10 * 0.18,
        color: THEME.faint,
        textTransform: 'uppercase',
        marginTop: 4,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 99,
    },
    statusText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.10,
        color: THEME.muted,
        textTransform: 'uppercase',
    },

    // ── Mode Container ──
    modeContainer: {
        flex: 1,
        gap: 24,
        justifyContent: 'center',
    },

    // ── Hero ──
    heroSection: {
        alignItems: 'center',
    },
    heroTitle: {
        fontFamily: THEME.mono,
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 24 * 0.34,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    heroSubtitle: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.10,
        color: THEME.muted,
        textTransform: 'uppercase',
        lineHeight: 16,
        marginTop: 2,
    },

    // ── Generate Button ──
    generateBtn: {
        width: '100%',
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(245,243,235,0.03)',
    },
    generateBtnText: {
        fontFamily: THEME.mono,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 12 * 0.24,
        color: THEME.ink,
        textTransform: 'uppercase',
        textAlign: 'center',
    },

    // ── OR Divider ──
    orRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    orLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(245,243,235,0.12)',
    },
    orText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.24,
        color: THEME.faint,
        textTransform: 'uppercase',
    },

    // ── Join Row ──
    joinRow: {
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.14)',
    },
    joinInput: {
        flex: 1,
        backgroundColor: 'transparent',
        color: THEME.ink,
        fontFamily: THEME.mono,
        fontSize: 14,
        letterSpacing: 14 * 0.22,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    joinBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(245,243,235,0.06)',
    },
    joinBtnText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 11 * 0.1,
        color: THEME.ink,
        textTransform: 'uppercase',
    },

    // ── Footer ──
    footer: {
        marginTop: 'auto',
        paddingTop: 24,
    },
    footerText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.10,
        color: THEME.muted,
        textTransform: 'uppercase',
        textAlign: 'center',
    },

    // ── Generated Mode ──
    generatedTitle: {
        fontFamily: THEME.mono,
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 20 * 0.28,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    generatedSubtitle: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.10,
        color: THEME.muted,
        textTransform: 'uppercase',
        lineHeight: 16,
        marginTop: 2,
    },

    // ── Key Card ──
    keyCard: {
        padding: 24,
        borderRadius: THEME.r,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)',
    },
    keyCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    keyCardLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    keyPill: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 99,
        backgroundColor: 'rgba(245,243,235,0.1)',
    },
    keyPillText: {
        fontFamily: THEME.mono,
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 14 * 0.1,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    keyCardActions: {
        flexDirection: 'row',
        gap: 10,
    },
    keyActionBtn: {
        flex: 1,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: 'rgba(245,243,235,0.2)',
        alignItems: 'center',
    },
    keyActionText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 10 * 0.15,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    keyCardFooter: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        textTransform: 'uppercase',
        textAlign: 'center',
        marginTop: 16,
    },

    // ── Enter Session Button ──
    enterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(245,243,235,0.06)',
    },
    enterBtnText: {
        fontFamily: THEME.mono,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 12 * 0.20,
        color: THEME.ink,
        textTransform: 'uppercase',
    },

    // ── Back Button ──
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 'auto',
        paddingTop: 16,
    },
    backText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.faint,
        textTransform: 'uppercase',
    },
});
