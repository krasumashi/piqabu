import React, { useState, useRef, useEffect } from 'react';
import {
    View, Image, TouchableOpacity, Text, StyleSheet, Alert, ScrollView,
    Animated as RNAnimated, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

const MAX_MEDIA_SIZE = 5 * 1024 * 1024; // 5MB base64 data URI

type MediaType = 'image' | 'video';
type EvidenceItem = { id: string; uri: string; type: MediaType };

let _idCounter = 0;
function nextId(): string {
    return `ev_${Date.now()}_${++_idCounter}`;
}

function isVideoUri(uri: string): boolean {
    return uri.startsWith('data:video/');
}

export default function RevealDeck({
    visible, onClose, onReveal, onOpenLiveMirror, maxImages = 10,
}: {
    visible: boolean;
    onClose: () => void;
    onReveal: (payload: string | null) => void;
    onOpenLiveMirror?: () => void;
    maxImages?: number;
}) {
    const [items, setItems] = useState<EvidenceItem[]>([]);
    const [exposedId, setExposedId] = useState<string | null>(null);
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

    const pickMedia = async () => {
        if (items.length >= maxImages) {
            Alert.alert('Limit Reached', `Maximum ${maxImages} items allowed.`);
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            base64: true,
            quality: 0.5,
            videoMaxDuration: 30, // 30 seconds max
        });

        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const isVideo = asset.type === 'video';

        if (isVideo) {
            // Video: copy to cache first (Android content:// URIs can't be read directly)
            if (!asset.uri) return;
            const cacheUri = FileSystem.cacheDirectory + 'reveal_video_' + Date.now() + '.mp4';
            try {
                await FileSystem.copyAsync({ from: asset.uri, to: cacheUri });
                const info = await FileSystem.getInfoAsync(cacheUri);
                if (info.exists && info.size && info.size > 3.5 * 1024 * 1024) {
                    // 3.5MB binary ≈ 4.8MB base64
                    Alert.alert('File Too Large', 'Video must be under ~3.5 MB. Try a shorter clip.');
                    await FileSystem.deleteAsync(cacheUri, { idempotent: true });
                    return;
                }
                const base64 = await FileSystem.readAsStringAsync(cacheUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                await FileSystem.deleteAsync(cacheUri, { idempotent: true });
                const mime = asset.mimeType || 'video/mp4';
                const dataUri = `data:${mime};base64,${base64}`;
                if (dataUri.length > MAX_MEDIA_SIZE) {
                    Alert.alert('File Too Large', 'Video is too large. Try a shorter clip.');
                    return;
                }
                setItems(prev => [...prev, { id: nextId(), uri: dataUri, type: 'video' }]);
            } catch (e: any) {
                console.warn('[RevealDeck] Video read error:', e);
                await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
                Alert.alert('Error', 'Could not read video file. Try a shorter or smaller video.');
            }
        } else {
            // Image: use base64 from picker
            if (!asset.base64) return;
            const mime = asset.mimeType || 'image/jpeg';
            let dataUri = `data:${mime};base64,${asset.base64}`;

            if (dataUri.length > MAX_MEDIA_SIZE) {
                // Retry at lower quality
                const lowRes = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    base64: true,
                    quality: 0.2,
                });
                if (!lowRes.canceled && lowRes.assets[0]?.base64) {
                    const lowMime = lowRes.assets[0].mimeType || 'image/jpeg';
                    const lowUri = `data:${lowMime};base64,${lowRes.assets[0].base64}`;
                    if (lowUri.length > MAX_MEDIA_SIZE) {
                        Alert.alert('File Too Large', 'Image is too large even at low quality. Choose a smaller image.');
                        return;
                    }
                    dataUri = lowUri;
                } else {
                    return;
                }
            }

            setItems(prev => [...prev, { id: nextId(), uri: dataUri, type: 'image' }]);
        }
    };

    // Radio-style expose: only ONE item exposed at a time
    const toggleExpose = (id: string) => {
        if (exposedId === id) {
            setExposedId(null);
            onReveal(null);
        } else {
            setExposedId(id);
            const item = items.find(i => i.id === id);
            if (item) onReveal(item.uri);
        }
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
        if (exposedId === id) {
            setExposedId(null);
            onReveal(null);
        }
    };

    const clearAll = () => {
        setItems([]);
        setExposedId(null);
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
                            LOADED: {items.length} • EXPOSED: {exposedId ? '1' : '0'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity onPress={pickMedia} style={styles.actionBtn} activeOpacity={0.7}>
                        <Text style={styles.actionBtnText}>+ ADD EVIDENCE</Text>
                    </TouchableOpacity>

                    {onOpenLiveMirror && (
                        <TouchableOpacity onPress={onOpenLiveMirror} style={styles.actionBtn} activeOpacity={0.7}>
                            <View style={styles.liveMirrorIcon} />
                            <Text style={[styles.actionBtnText, { color: THEME.live }]}>LIVE MIRROR</Text>
                        </TouchableOpacity>
                    )}

                    {items.length > 0 && (
                        <TouchableOpacity onPress={clearAll} style={[styles.actionBtn, { marginLeft: 'auto' }]} activeOpacity={0.7}>
                            <Text style={[styles.actionBtnText, { color: THEME.bad }]}>CLEAR ALL</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content */}
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {items.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="folder-open-outline" size={32} color={THEME.faint} />
                            <Text style={styles.emptyText}>NO EVIDENCE LOADED</Text>
                        </View>
                    ) : (
                        items.map((item, idx) => {
                            const isExposed = exposedId === item.id;
                            return (
                                <View key={item.id} style={styles.evidenceRow}>
                                    {/* Thumbnail */}
                                    <View style={styles.thumb}>
                                        {item.type === 'video' ? (
                                            <View style={styles.videoThumb}>
                                                <Ionicons name="videocam" size={22} color={THEME.muted} />
                                            </View>
                                        ) : (
                                            <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                                        )}
                                    </View>

                                    {/* Meta */}
                                    <View style={styles.meta}>
                                        <Text style={styles.metaTitle}>EVIDENCE {idx + 1}</Text>
                                        <View style={styles.metaRow}>
                                            <Text style={styles.metaType}>
                                                {item.type === 'video' ? 'VIDEO' : 'IMAGE'}
                                            </Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={[styles.metaStatus, isExposed && { color: THEME.accEmerald }]}>
                                                {isExposed ? 'EXPOSED' : 'HIDDEN'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Actions: Delete + Expose/Cover */}
                                    <TouchableOpacity
                                        onPress={() => removeItem(item.id)}
                                        style={styles.deleteBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="trash-outline" size={14} color={THEME.faint} />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => toggleExpose(item.id)}
                                        style={[styles.toggleBtn, isExposed && styles.toggleBtnActive]}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.toggleText, isExposed && styles.toggleTextActive]}>
                                            {isExposed ? 'COVER' : 'EXPOSE'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                {/* Video Preview for exposed video */}
                {exposedId && items.find(i => i.id === exposedId)?.type === 'video' && (
                    <View style={styles.videoPreview}>
                        <Video
                            source={{ uri: items.find(i => i.id === exposedId)!.uri }}
                            style={styles.videoPlayer}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping={false}
                        />
                    </View>
                )}

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
    videoThumb: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
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
    deleteBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
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
    videoPreview: {
        height: 140,
        marginHorizontal: 14,
        marginBottom: 6,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
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
