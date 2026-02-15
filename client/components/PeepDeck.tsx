import React, { useRef, useEffect, useState } from 'react';
import { View, Image, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { THEME } from '../constants/Theme';

export default function PeepDeck({
    remoteImage, visible, onClose,
}: {
    remoteImage: string | null;
    visible: boolean;
    onClose: () => void;
}) {
    const slideAnim = useRef(new RNAnimated.Value(600)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;
    const [focusedItem, setFocusedItem] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            ]).start();
        } else {
            slideAnim.setValue(600);
            fadeAnim.setValue(0);
            setFocusedItem(null);
        }
    }, [visible]);

    // When sender covers (remoteImage → null), close fullscreen immediately
    useEffect(() => {
        if (!remoteImage) setFocusedItem(null);
    }, [remoteImage]);

    // Prevent screenshots when viewing revealed images
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (visible && remoteImage) {
            ScreenCapture.preventScreenCaptureAsync('peepDeck');
        } else {
            ScreenCapture.allowScreenCaptureAsync('peepDeck');
        }
        return () => {
            ScreenCapture.allowScreenCaptureAsync('peepDeck');
        };
    }, [visible, remoteImage]);

    if (!visible) return null;

    // Watermark overlay component
    const Watermark = () => (
        <View style={styles.watermarkOverlay} pointerEvents="none">
            {[0, 1, 2, 3, 4].map(i => (
                <Text key={i} style={styles.watermarkText}>PIQABU</Text>
            ))}
        </View>
    );

    // Focus modal
    if (focusedItem) {
        return (
            <Modal visible={true} animationType="fade" transparent>
                <View style={styles.focusModal}>
                    <View style={styles.focusHeader}>
                        <TouchableOpacity onPress={() => setFocusedItem(null)} activeOpacity={0.7}>
                            <Ionicons name="contract-outline" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.focusBody}>
                        <Image source={{ uri: focusedItem }} style={styles.focusImage} resizeMode="contain" />
                        <Watermark />
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Backdrop */}
            <RNAnimated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </RNAnimated.View>

            {/* Card */}
            <RNAnimated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>PEEP ROOM</Text>
                        <Text style={styles.headerSub}>VIEW ONLY • NO TRACE</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>FOLD SHUT</Text>
                    </TouchableOpacity>
                </View>

                {/* Grid */}
                <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
                    {!remoteImage ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="eye-off-outline" size={32} color={THEME.faint} />
                            <Text style={styles.emptyText}>NOTHING EXPOSED... YET</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => setFocusedItem(remoteImage)}
                            style={styles.gridItem}
                            activeOpacity={0.8}
                        >
                            <Image source={{ uri: remoteImage }} style={styles.gridImage} resizeMode="cover" />
                            <Watermark />
                            <View style={styles.gridItemLabel}>
                                <Text style={styles.gridItemType}>IMAGE</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>YOU DIDN'T SEE THIS</Text>
                </View>
            </RNAnimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
        zIndex: 20,
    },
    card: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
        top: 100,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.20)',
        backgroundColor: THEME.paper,
        zIndex: 21,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.6,
        shadowRadius: 40,
        elevation: 20,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(245,243,235,0.14)',
    },
    headerTitle: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.28,
        fontWeight: '900',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    headerSub: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        marginTop: 8,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    closeBtn: {
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.20)',
        backgroundColor: 'transparent',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
    },
    closeBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        fontWeight: '900',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    grid: {
        flex: 1,
    },
    gridContent: {
        padding: 14,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.1,
        color: THEME.faint,
        textTransform: 'uppercase',
        marginTop: 12,
    },
    gridItem: {
        width: '31%',
        aspectRatio: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)',
        overflow: 'hidden',
    },
    gridImage: {
        width: '100%',
        height: '100%',
        opacity: 0.8,
    },
    gridItemLabel: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingVertical: 2,
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    gridItemType: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    footer: {
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(245,243,235,0.14)',
        alignItems: 'center',
    },
    footerText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        textTransform: 'uppercase',
    },
    // Focus Modal
    focusModal: {
        flex: 1,
        backgroundColor: '#000',
    },
    focusHeader: {
        padding: 16,
        alignItems: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    focusBody: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    focusImage: {
        width: '100%',
        height: '100%',
    },
    watermarkOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-around',
        alignItems: 'center',
        transform: [{ rotate: '-30deg' }],
        zIndex: 5,
    },
    watermarkText: {
        fontFamily: THEME.mono,
        fontSize: 24,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.04)',
        letterSpacing: 12,
        textTransform: 'uppercase',
    },
});
