/**
 * FeatureGuide
 *
 * The "what does each button do" reference card. Opens from Settings,
 * lives as a bottom-sheet modal in the same visual grammar as the
 * Settings panel itself. Each entry can be tapped to expand a short
 * accurate description in place — no separate detail screen, no
 * navigation jump.
 *
 * Replaces the auto-firing room walkthrough per user direction: better
 * pattern for a discreet privacy app — never interrupts, always
 * available, self-paced.
 */
import React, { useRef, useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated,
    Dimensions, Easing,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';

interface FeatureGuideProps {
    visible: boolean;
    onClose: () => void;
}

type IconLib = 'ion' | 'mc'; // Ionicons or MaterialCommunityIcons

interface Feature {
    id: string;
    icon: string;
    iconLib: IconLib;
    name: string;
    what: string;     // One-line "what it's for"
    how: string;      // How to use / find it
}

interface FeatureCategory {
    label: string;
    items: Feature[];
}

const CATEGORIES: FeatureCategory[] = [
    {
        label: 'IN A CHANNEL',
        items: [
            {
                id: 'autovanish',
                icon: 'flash',
                iconLib: 'ion',
                name: 'AUTO VANISH',
                what: 'Delete your own messages automatically after a set time.',
                how: 'Tap the lightning bolt in the room header to cycle: 5s, 10s, 15s, 20s, 25s, 30s, OFF. While it\'s on, every message you send disappears from both your screen and your correspondent\'s after the chosen window.',
            },
            {
                id: 'peep',
                icon: 'eye-outline',
                iconLib: 'ion',
                name: 'PEEK',
                what: 'View images, videos, and files your correspondent has shared with you.',
                how: 'When they tap REVEAL on their side, what they sent appears in your PEEK. Closing the view makes it vanish on both ends — nothing is saved.',
            },
            {
                id: 'reveal',
                icon: 'folder-open-outline',
                iconLib: 'ion',
                name: 'REVEAL',
                what: 'Send your own images, documents, or files to your correspondent.',
                how: 'Tap REVEAL, pick a file, send. They open it through PEEK on their side. The file auto-deletes from our servers within 30 minutes regardless of whether they viewed it.',
            },
            {
                id: 'whisper',
                icon: 'mic-outline',
                iconLib: 'ion',
                name: 'WHISPER',
                what: 'Push-to-talk voice — like a walkie-talkie.',
                how: 'Tap WHISPER to invite the other side. Hold the mic to talk, release to listen. Audio is peer-to-peer (WebRTC) — it never touches our servers.',
            },
            {
                id: 'liveglass',
                icon: 'videocam-outline',
                iconLib: 'ion',
                name: 'LIVE GLASS',
                what: 'Camera-to-camera video, like a video call.',
                how: 'Tap PIQA LIVE in the header, then LIVE GLASS. Both sides see each other live. The video stream is peer-to-peer.',
            },
            {
                id: 'livemirror',
                icon: 'phone-portrait-outline',
                iconLib: 'ion',
                name: 'LIVE MIRROR',
                what: 'Share your screen, view-only.',
                how: 'PIQA LIVE → LIVE MIRROR. Your correspondent sees what you see in real-time. They cannot tap, save, or screenshot.',
            },
        ],
    },
    {
        label: 'IDENTITY & SHARING',
        items: [
            {
                id: 'channelkey',
                icon: 'key-outline',
                iconLib: 'ion',
                name: 'CHANNEL KEY',
                what: 'Your 6-character channel code.',
                how: 'Share this code with one person to start a private chat. Codes expire 30 minutes after creation if nobody joins.',
            },
            {
                id: 'ghostsync',
                icon: 'ghost-outline',
                iconLib: 'mc',
                name: 'GHOST SYNC',
                what: 'Link a second device to the same channel.',
                how: 'Tap the ghost icon in the room header on the device you want to add. Useful for switching between phone and tablet without losing your conversation.',
            },
            {
                id: 'mint',
                icon: 'add-circle-outline',
                iconLib: 'ion',
                name: 'MINT (Piqabu Keyboard)',
                what: 'Generate a channel link from inside any other app.',
                how: 'With the Piqabu Keyboard active (e.g. while typing in WhatsApp), tap MINT. The link is inserted into the host message box. Tap OPEN to switch into Piqabu and wait for your correspondent. Pro feature.',
            },
        ],
    },
    {
        label: 'PROTECTION',
        items: [
            {
                id: 'panic',
                icon: 'calculator-outline',
                iconLib: 'ion',
                name: 'PANIC MODE',
                what: 'Disguise Piqabu as a calculator.',
                how: 'Enable from Settings → Panic. When triggered, Piqabu swaps the UI for a working calculator. Tap the correct code to return.',
            },
            {
                id: 'biometric',
                icon: 'finger-print-outline',
                iconLib: 'ion',
                name: 'BIOMETRIC LOCK',
                what: 'Require fingerprint or face unlock to open Piqabu.',
                how: 'Settings → Biometric Lock. The app re-locks when you background it, so a quick glance at someone else\'s screen does not betray your last message.',
            },
            {
                id: 'wipe',
                icon: 'trash-outline',
                iconLib: 'ion',
                name: 'WIPE EVERYTHING',
                what: 'Erase all local Piqabu data on this device.',
                how: 'Settings → Wipe Everything. Removes your Ghost ID, settings, message buffers, cached files. The app is reset to fresh-install state. Cannot be undone.',
            },
        ],
    },
];

export default function FeatureGuide({ visible, onClose }: FeatureGuideProps) {
    const insets = useSafeAreaInsets();
    const SCREEN_H = Dimensions.get('window').height;
    const SHEET_HEIGHT = Math.min(SCREEN_H * 0.85, 720);
    const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 180, mass: 1, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
            ]).start();
            // Reset expanded state when closing so the next open starts
            // cleanly without remembering whatever the user was reading.
            setExpandedId(null);
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </Animated.View>

            <Animated.View
                style={[
                    styles.sheet,
                    {
                        height: SHEET_HEIGHT,
                        paddingBottom: insets.bottom + 18,
                        transform: [{ translateY: slideAnim }],
                    },
                ]}
            >
                <View style={styles.handleWrap}>
                    <View style={styles.handle} />
                </View>

                <View style={styles.header}>
                    <Text style={styles.title}>FEATURE GUIDE</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} hitSlop={8}>
                        <Ionicons name="close" size={18} color={THEME.muted} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.subtitle}>What each button does. Tap a row to learn how to use it.</Text>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {CATEGORIES.map((cat) => (
                        <View key={cat.label} style={styles.categoryGroup}>
                            <Text style={styles.categoryLabel}>{cat.label}</Text>
                            {cat.items.map((f) => (
                                <FeatureRow
                                    key={f.id}
                                    feature={f}
                                    expanded={expandedId === f.id}
                                    onTap={() => setExpandedId((id) => id === f.id ? null : f.id)}
                                />
                            ))}
                        </View>
                    ))}
                </ScrollView>
            </Animated.View>
        </View>
    );
}

function FeatureRow({
    feature, expanded, onTap,
}: { feature: Feature; expanded: boolean; onTap: () => void }) {
    const fade = useRef(new Animated.Value(expanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(fade, {
            toValue: expanded ? 1 : 0,
            duration: expanded ? 220 : 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [expanded, fade]);

    const IconComp = feature.iconLib === 'mc' ? MaterialCommunityIcons : Ionicons;

    return (
        <View>
            {/* Segmented-cell header: accessory · title · disclosure */}
            <TouchableOpacity onPress={onTap} activeOpacity={0.7} style={styles.segRow}>
                <View style={[styles.cell, styles.squareCell, expanded && styles.cellActive]}>
                    <IconComp
                        name={feature.icon as any}
                        size={18}
                        color={expanded ? THEME.ink : THEME.muted}
                    />
                </View>
                <View style={[styles.cell, styles.titleCell, expanded && styles.cellActive]}>
                    <Text style={[styles.rowName, expanded && styles.rowNameActive]} numberOfLines={1}>
                        {feature.name}
                    </Text>
                </View>
                <View style={[styles.cell, styles.squareCell, expanded && styles.cellActive]}>
                    <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={THEME.faint}
                    />
                </View>
            </TouchableOpacity>

            {expanded && (
                <Animated.View style={[styles.detail, { opacity: fade }]}>
                    <Text style={styles.detailLabel}>WHAT IT DOES</Text>
                    <Text style={styles.detailText}>{feature.what}</Text>
                    <Text style={[styles.detailLabel, { marginTop: 10 }]}>HOW TO USE</Text>
                    <Text style={styles.detailText}>{feature.how}</Text>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 90,
    },
    sheet: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        backgroundColor: THEME.paper,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        borderTopColor: THEME.edge,
        borderLeftWidth: 1,
        borderLeftColor: THEME.edge2,
        borderRightWidth: 1,
        borderRightColor: THEME.edge2,
        zIndex: 100,
        paddingHorizontal: 18,
        paddingTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -14 },
        shadowOpacity: 0.55,
        shadowRadius: 30,
        elevation: 30,
    },
    handleWrap: {
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 8,
    },
    handle: {
        width: 38, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(245,243,235,0.18)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.28,
        textTransform: 'uppercase',
        color: THEME.muted,
        fontWeight: '900',
    },
    closeBtn: {
        width: 32, height: 32,
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(245,243,235,0.06)',
    },
    subtitle: {
        fontFamily: THEME.mono,
        fontSize: 10,
        lineHeight: 14,
        color: THEME.faint,
        letterSpacing: 0.3,
        marginBottom: 14,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: THEME.edge2,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 14, gap: 18 },
    categoryGroup: { gap: 9 },
    categoryLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.28,
        fontWeight: '900',
        color: THEME.faint,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    /* Segmented-cell row — shares MenuRow's visual tokens. */
    segRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    cell: {
        height: 50,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(245,243,235,0.035)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cellActive: {
        borderColor: 'rgba(245,243,235,0.34)',
        backgroundColor: 'rgba(245,243,235,0.09)',
    },
    squareCell: {
        width: 50,
    },
    titleCell: {
        flex: 1,
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    rowName: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 1.4,
        fontWeight: '800',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    rowNameActive: {
        color: THEME.ink,
    },
    detail: {
        marginTop: 7,
        padding: 14,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.12)',
        backgroundColor: 'rgba(245,243,235,0.03)',
    },
    detailLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '800',
        color: THEME.faint,
        marginBottom: 4,
    },
    detailText: {
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.ink,
        letterSpacing: 0.3,
    },
});
