/**
 * KeyboardFeaturesSlide
 *
 * Onboarding slide that previews the Piqabu Keyboard's silent features
 * with subtle staggered entrance animations. Sits between the
 * "PIQABU KEYBOARD" intro slide and the ENABLE/UNLOCK CTA — gives the
 * user a clear sense of *what* they're being asked to enable before
 * the system IME settings screen takes over.
 *
 * Animation is intentionally restrained — feature rows fade + slide up
 * with a small per-row delay when the slide becomes active. No bouncy
 * springs, no pulsing icons — matches the brand's calm-and-discreet
 * voice.
 */
import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    Dimensions,
    Platform,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface Feature {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
}

interface SlideData {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    features?: Feature[];
}

interface Props {
    item: SlideData;
    active: boolean;
    isPro: boolean;
    onCtaPress: () => void;
}

const { width } = Dimensions.get('window');

export default function KeyboardFeaturesSlide({ item, active, isPro, onCtaPress }: Props) {
    const features = item.features ?? [];
    // One animated pair (opacity, translateY) per feature row, plus one for
    // the header and one for the CTA. Created once on mount.
    const rowAnims = useRef(
        features.map(() => ({
            opacity: new Animated.Value(0),
            translateY: new Animated.Value(12),
        })),
    ).current;
    const headerAnim = useRef(new Animated.Value(0)).current;
    const ctaAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active) {
            // Reset to invisible if the user scrolls away — re-animates
            // next time they land on this slide.
            headerAnim.setValue(0);
            ctaAnim.setValue(0);
            rowAnims.forEach(a => {
                a.opacity.setValue(0);
                a.translateY.setValue(12);
            });
            return;
        }

        const animations: Animated.CompositeAnimation[] = [
            Animated.timing(headerAnim, {
                toValue: 1,
                duration: 320,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ];
        rowAnims.forEach((a, i) => {
            const delay = 220 + i * 90;
            animations.push(
                Animated.timing(a.opacity, {
                    toValue: 1,
                    duration: 260,
                    delay,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(a.translateY, {
                    toValue: 0,
                    duration: 320,
                    delay,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            );
        });
        animations.push(
            Animated.timing(ctaAnim, {
                toValue: 1,
                duration: 280,
                delay: 220 + features.length * 90 + 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        );
        Animated.parallel(animations).start();
    }, [active]);

    return (
        <View style={styles.root}>
            <Animated.View style={[styles.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                <View style={styles.headerIconWrap}>
                    <Ionicons name={item.icon} size={22} color={THEME.ink} />
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
            </Animated.View>

            <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
            >
                {features.map((f, i) => (
                    <Animated.View
                        key={f.title}
                        style={[
                            styles.row,
                            {
                                opacity: rowAnims[i].opacity,
                                transform: [{ translateY: rowAnims[i].translateY }],
                            },
                        ]}
                    >
                        <View style={styles.rowIcon}>
                            <Ionicons name={f.icon} size={16} color={THEME.ink} />
                        </View>
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>{f.title}</Text>
                            <Text style={styles.rowDesc}>{f.desc}</Text>
                        </View>
                    </Animated.View>
                ))}
            </ScrollView>

            <Animated.View
                style={{
                    opacity: ctaAnim,
                    transform: [{ translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                    alignItems: 'center',
                }}
            >
                <TouchableOpacity
                    onPress={onCtaPress}
                    activeOpacity={0.75}
                    style={styles.cta}
                >
                    <Ionicons
                        name={Platform.OS !== 'android'
                            ? 'phone-portrait-outline'
                            : (isPro ? 'add-circle-outline' : 'lock-closed-outline')}
                        size={16}
                        color={THEME.ink}
                    />
                    <Text style={styles.ctaText}>
                        {Platform.OS !== 'android'
                            ? 'Android only for now'
                            : (isPro ? 'Enable Piqabu Keyboard' : 'Unlock with Piqabu Pro')}
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        width,
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: 60,
        paddingBottom: 16,
    },
    header: {
        alignItems: 'center',
        marginBottom: 22,
    },
    headerIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: THEME.edge,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    title: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 14,
        letterSpacing: 3,
        fontWeight: '900',
        marginBottom: 4,
    },
    subtitle: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 9,
        letterSpacing: 1.6,
        fontWeight: '600',
    },
    listScroll: {
        flex: 1,
    },
    list: {
        gap: 12,
        paddingVertical: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.edge2,
        backgroundColor: 'rgba(255,255,255,0.025)',
    },
    rowIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: THEME.edge2,
    },
    rowText: { flex: 1 },
    rowTitle: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 10,
        letterSpacing: 1.6,
        fontWeight: '800',
        marginBottom: 3,
    },
    rowDesc: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 9,
        lineHeight: 13,
    },
    cta: {
        marginTop: 14,
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#FFFFFF',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    ctaText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.ink,
        textTransform: 'uppercase',
    },
});
