import React, { useRef, useEffect, useState } from 'react';
import { View, Image, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated as RNAnimated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';
import { THEME } from '../constants/Theme';
import { CONFIG } from '../constants/Config';

// Detect media type from URI (supports both data URIs and server URLs)
function isVideoUri(uri: string): boolean {
    return uri.startsWith('data:video/') || /\.(mp4|mov|avi|webm)$/i.test(uri);
}

function isAudioUri(uri: string): boolean {
    return uri.startsWith('data:audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(uri);
}

function isPdfUri(uri: string): boolean {
    return uri.startsWith('data:application/pdf') || /\.pdf$/i.test(uri);
}

function isDocUri(uri: string): boolean {
    return /\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|json|xml|zip)$/i.test(uri);
}

// Resolve server URLs to full URLs
function resolveUri(uri: string): string {
    if (uri.startsWith('/uploads/')) {
        return `${CONFIG.SIGNAL_TOWER_URL}${uri}`;
    }
    return uri;
}

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

    // Prevent screenshots when viewing revealed media
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

    const resolvedUri = remoteImage ? resolveUri(remoteImage) : null;
    const isVideo = remoteImage ? isVideoUri(remoteImage) : false;
    const isAudio = remoteImage ? isAudioUri(remoteImage) : false;
    const isPdf = remoteImage ? isPdfUri(remoteImage) : false;
    const isDoc = remoteImage ? isDocUri(remoteImage) : false;

    // Watermark overlay component
    const Watermark = () => (
        <View style={styles.watermarkOverlay} pointerEvents="none">
            {[0, 1, 2, 3, 4].map(i => (
                <Text key={i} style={styles.watermarkText}>PIQABU</Text>
            ))}
        </View>
    );

    // Helper: open PDF with system viewer via expo-sharing
    const openDocument = async (uri: string, ext: string = 'pdf') => {
        try {
            const fullUrl = resolveUri(uri);
            const cacheUri = (FileSystem.cacheDirectory || '') + 'piqabu_received_' + Date.now() + '.' + ext;

            if (fullUrl.startsWith('http')) {
                // Download from server
                const dl = await FileSystem.downloadAsync(fullUrl, cacheUri);
                if (!dl.uri) {
                    Alert.alert('Error', 'Could not download file.');
                    return;
                }
            } else {
                // Base64 data URI
                const base64Data = fullUrl.split(',')[1];
                if (!base64Data) {
                    Alert.alert('Error', 'Invalid file data.');
                    return;
                }
                await FileSystem.writeAsStringAsync(cacheUri, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });
            }

            try {
                const Sharing = require('expo-sharing');
                if (await Sharing.isAvailableAsync()) {
                    const mimeMap: Record<string, string> = {
                        pdf: 'application/pdf',
                        doc: 'application/msword',
                        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        xls: 'application/vnd.ms-excel',
                        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    };
                    await Sharing.shareAsync(cacheUri, {
                        mimeType: mimeMap[ext] || 'application/octet-stream',
                    });
                } else {
                    Alert.alert('Unavailable', 'Sharing is not available on this device.');
                }
            } catch (shareErr: any) {
                console.warn('[PeepDeck] Share error:', shareErr?.message);
                Alert.alert('Error', 'Could not open file.');
            }
            setTimeout(() => {
                FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
            }, 30000);
        } catch (e: any) {
            console.warn('[PeepDeck] Document open error:', e?.message);
            Alert.alert('Error', 'Could not open file.');
        }
    };

    // Get file extension from URI
    const getExt = (uri: string): string => {
        const match = uri.match(/\.(\w+)$/);
        return match ? match[1].toLowerCase() : 'pdf';
    };

    // Focus modal (expanded view)
    if (focusedItem) {
        const focusResolved = resolveUri(focusedItem);
        const focusIsVideo = isVideoUri(focusedItem);
        const focusIsAudio = isAudioUri(focusedItem);
        const focusIsPdf = isPdfUri(focusedItem);
        const focusIsDoc = isDocUri(focusedItem);
        return (
            <Modal visible={true} animationType="fade" transparent>
                <View style={styles.focusModal}>
                    <View style={styles.focusHeader}>
                        <TouchableOpacity onPress={() => setFocusedItem(null)} activeOpacity={0.7}>
                            <Ionicons name="contract-outline" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.focusBody}>
                        {focusIsVideo ? (
                            <Video
                                source={{ uri: focusResolved }}
                                style={styles.focusImage}
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay
                                isLooping={false}
                                useNativeControls={false}
                            />
                        ) : focusIsAudio ? (
                            <View style={styles.audioFocusCard}>
                                <Ionicons name="musical-notes" size={48} color={THEME.accSky} />
                                <Text style={styles.audioFocusLabel}>AUDIO PLAYING</Text>
                                <Video
                                    source={{ uri: focusResolved }}
                                    style={{ width: 0, height: 0 }}
                                    shouldPlay
                                    isLooping={false}
                                />
                            </View>
                        ) : (focusIsPdf || focusIsDoc) ? (
                            <View style={styles.pdfFocusCard}>
                                <Ionicons name="document-text" size={56} color={THEME.accSky} />
                                <Text style={styles.audioFocusLabel}>{focusIsPdf ? 'PDF DOCUMENT' : 'DOCUMENT'}</Text>
                                <Text style={styles.pdfFocusSub}>
                                    Open with your device's viewer
                                </Text>
                                <TouchableOpacity
                                    onPress={() => openDocument(focusedItem, getExt(focusedItem))}
                                    style={styles.pdfOpenBtn}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="open-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                                    <Text style={styles.pdfOpenBtnText}>OPEN FILE</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Image source={{ uri: focusResolved }} style={styles.focusImage} resizeMode="contain" />
                        )}
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
                    {!remoteImage || !resolvedUri ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="eye-off-outline" size={32} color={THEME.faint} />
                            <Text style={styles.emptyText}>NOTHING EXPOSED... YET</Text>
                        </View>
                    ) : isAudio ? (
                        <TouchableOpacity
                            onPress={() => setFocusedItem(remoteImage)}
                            style={styles.audioContainer}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="musical-notes" size={36} color={THEME.accSky} />
                            <Text style={styles.audioLabel}>AUDIO FILE</Text>
                            <Text style={styles.audioSub}>TAP TO PLAY</Text>
                            <Video
                                source={{ uri: resolvedUri }}
                                style={{ width: 0, height: 0 }}
                                shouldPlay
                                isLooping={false}
                            />
                            <Watermark />
                            <View style={styles.gridItemLabel}>
                                <Text style={styles.gridItemType}>AUDIO</Text>
                            </View>
                        </TouchableOpacity>
                    ) : isPdf || isDoc ? (
                        <TouchableOpacity
                            onPress={() => setFocusedItem(remoteImage)}
                            style={styles.pdfContainer}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="document-text" size={36} color={THEME.accSky} />
                            <Text style={styles.audioLabel}>{isPdf ? 'PDF DOCUMENT' : 'DOCUMENT'}</Text>
                            <Text style={styles.audioSub}>TAP TO OPEN</Text>
                            <Watermark />
                            <View style={styles.gridItemLabel}>
                                <Text style={styles.gridItemType}>{isPdf ? 'PDF' : 'DOC'}</Text>
                            </View>
                        </TouchableOpacity>
                    ) : isVideo ? (
                        <View style={styles.videoContainer}>
                            <Video
                                source={{ uri: resolvedUri }}
                                style={styles.videoPlayer}
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay
                                isLooping={false}
                                useNativeControls={false}
                            />
                            <Watermark />
                            <TouchableOpacity
                                onPress={() => setFocusedItem(remoteImage)}
                                style={styles.expandBtn}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="expand-outline" size={18} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.gridItemLabel}>
                                <Text style={styles.gridItemType}>VIDEO</Text>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => setFocusedItem(remoteImage)}
                            style={styles.gridItem}
                            activeOpacity={0.8}
                        >
                            <Image source={{ uri: resolvedUri }} style={styles.gridImage} resizeMode="cover" />
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
    videoContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
    },
    expandBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
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
    audioContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.25)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    audioLabel: {
        fontFamily: THEME.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 11 * 0.22,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    audioSub: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.14,
        color: THEME.faint,
        textTransform: 'uppercase',
    },
    pdfContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.25)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    audioFocusCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    audioFocusLabel: {
        fontFamily: THEME.mono,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 12 * 0.22,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    pdfFocusCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    pdfFocusSub: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    pdfOpenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginTop: 8,
    },
    pdfOpenBtnText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 11 * 0.22,
        color: '#fff',
        textTransform: 'uppercase',
    },
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
