import React, { useState, useRef, useEffect } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Alert, ScrollView, Animated as RNAnimated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024;

export default function RevealDeck({
    visible, onClose, onReveal, onOpenLiveMirror,
}: {
    visible: boolean;
    onClose: () => void;
    onReveal: (payload: string | null) => void;
    onOpenLiveMirror?: () => void;
}) {
    const [image, setImage] = useState<string | null>(null);
    const [isRevealed, setRevealed] = useState(false);
    const slideAnim = useRef(new RNAnimated.Value(600)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            ]).start();
        } else {
            slideAnim.setValue(600);
            fadeAnim.setValue(0);
        }
    }, [visible]);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].base64) {
            const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
            if (dataUri.length > MAX_IMAGE_SIZE) {
                const lowRes = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    base64: true,
                    quality: 0.2,
                });
                if (!lowRes.canceled && lowRes.assets[0].base64) {
                    const lowUri = `data:image/jpeg;base64,${lowRes.assets[0].base64}`;
                    if (lowUri.length > MAX_IMAGE_SIZE) {
                        Alert.alert('File Too Large', 'Image is too large even at low quality. Choose a smaller image.');
                        return;
                    }
                    setImage(lowUri);
                    setRevealed(false);
                    return;
                }
                return;
            }
            setImage(dataUri);
            setRevealed(false);
        }
    };

    const toggleReveal = () => {
        if (!image) return;
        const newState = !isRevealed;
        setRevealed(newState);
        onReveal(newState ? image : null);
    };

    const clear = () => {
        setImage(null);
        setRevealed(false);
        onReveal(null);
    };

    if (!visible) return null;

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
                        <Text style={styles.headerTitle}>REVEAL VAULT</Text>
                        <Text style={styles.headerSub}>
                            LOADED: {image ? '1' : '0'} • EXPOSED: {isRevealed ? '1' : '0'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity onPress={pickImage} style={styles.actionBtn} activeOpacity={0.7}>
                        <Text style={styles.actionBtnText}>+ ADD EVIDENCE</Text>
                    </TouchableOpacity>

                    {onOpenLiveMirror && (
                        <TouchableOpacity onPress={onOpenLiveMirror} style={styles.actionBtn} activeOpacity={0.7}>
                            <View style={styles.liveMirrorIcon} />
                            <Text style={[styles.actionBtnText, { color: THEME.live }]}>LIVE MIRROR</Text>
                        </TouchableOpacity>
                    )}

                    {image && (
                        <TouchableOpacity onPress={clear} style={[styles.actionBtn, { marginLeft: 'auto' }]} activeOpacity={0.7}>
                            <Text style={[styles.actionBtnText, { color: THEME.bad }]}>CLEAR ALL</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content */}
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {!image ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="folder-open-outline" size={32} color={THEME.faint} />
                            <Text style={styles.emptyText}>NO EVIDENCE LOADED</Text>
                        </View>
                    ) : (
                        <View style={styles.evidenceRow}>
                            {/* Thumbnail */}
                            <View style={styles.thumb}>
                                <Image source={{ uri: image }} style={styles.thumbImage} resizeMode="cover" />
                            </View>

                            {/* Meta */}
                            <View style={styles.meta}>
                                <Text style={styles.metaTitle}>EVIDENCE 1</Text>
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaType}>IMAGE</Text>
                                    <Text style={styles.metaDivider}>•</Text>
                                    <Text style={[styles.metaStatus, isRevealed && { color: THEME.accEmerald }]}>
                                        {isRevealed ? 'EXPOSED' : 'HIDDEN'}
                                    </Text>
                                </View>
                            </View>

                            {/* Toggle */}
                            <TouchableOpacity
                                onPress={toggleReveal}
                                style={[styles.toggleBtn, isRevealed && styles.toggleBtnActive]}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.toggleText, isRevealed && styles.toggleTextActive]}>
                                    {isRevealed ? 'COVER' : 'EXPOSE'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        EXPOSE = VISIBLE TO THEIR PEEP ROOM. COVER = HIDDEN.
                    </Text>
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
    actions: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: 14,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.20)',
        backgroundColor: 'transparent',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
    },
    actionBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        fontWeight: '900',
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    liveMirrorIcon: {
        width: 8,
        height: 8,
        borderWidth: 1.5,
        borderColor: THEME.live,
        borderRadius: 2,
    },
    list: {
        flex: 1,
    },
    listContent: {
        padding: 14,
        paddingTop: 0,
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
    evidenceRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)',
        padding: 10,
    },
    thumb: {
        width: 58,
        height: 58,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)',
        overflow: 'hidden',
    },
    thumbImage: {
        width: '100%',
        height: '100%',
    },
    meta: {
        flex: 1,
        minWidth: 0,
    },
    metaTitle: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 10 * 0.22,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    metaRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    metaType: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.14,
        color: THEME.faint,
        textTransform: 'uppercase',
    },
    metaDivider: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.faint,
    },
    metaStatus: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.14,
        color: THEME.faint,
        textTransform: 'uppercase',
    },
    toggleBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.14)',
        minWidth: 60,
        alignItems: 'center',
    },
    toggleBtnActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    toggleText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.18,
        fontWeight: '900',
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    toggleTextActive: {
        color: THEME.accEmerald,
    },
    footer: {
        padding: 14,
        paddingBottom: 16,
        alignItems: 'center',
    },
    footerText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
});
