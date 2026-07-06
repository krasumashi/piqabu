import React, { useRef, useEffect, useState } from 'react';
import { View, Image, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated as RNAnimated, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { Video, ResizeMode } from 'expo-av';
import { THEME } from '../constants/Theme';
import { CONFIG } from '../constants/Config';
import DocumentViewer from './DocumentViewer';
import SignatureModal from './SignatureModal';
import SynthesisIndicator from './SynthesisIndicator';

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
    remoteImages, visible, onClose, videoControls, onSign, trayHeight,
}: {
    /** Session gallery — every item the partner has shown this session.
     *  Rendered as a grid; tap any cell to focus (full view / playback). */
    remoteImages: string[];
    visible: boolean;
    onClose: () => void;
    videoControls?: { action: string; position?: number } | null;
    /** Optional callback for the SIGN & RETURN flow on PDFs. Receives the
     *  formatted signature line ready to wire into sendText. */
    onSign?: (signatureLine: string) => void;
    /** When set, Peek renders as a bottom-docked TRAY of this pixel height
     *  (WhatsApp-style) instead of a floating sheet: no backdrop, full width,
     *  top-rounded, and touches above it pass through so the chat feed +
     *  compose bar stay visible and usable. The room lifts the compose above
     *  the tray. Undefined → the original floating-sheet behaviour. */
    trayHeight?: number;
}) {
    const slideAnim = useRef(new RNAnimated.Value(600)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;
    const [focusedItem, setFocusedItem] = useState<string | null>(null);
    const videoRef = useRef<any>(null);
    const [signatureVisible, setSignatureVisible] = useState(false);

    useEffect(() => {
        if (!videoControls || !videoRef.current) return;
        if (videoControls.action === 'pause') {
            videoRef.current.pauseAsync?.();
        } else if (videoControls.action === 'play') {
            videoRef.current.playAsync?.();
        } else if (videoControls.action === 'seek' && videoControls.position !== undefined) {
            videoRef.current.setPositionAsync?.(videoControls.position);
        }
    }, [videoControls]);

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

    // If the focused item leaves the gallery (session reset), close focus.
    useEffect(() => {
        if (focusedItem && !remoteImages.includes(focusedItem)) setFocusedItem(null);
    }, [remoteImages, focusedItem]);

    // Prevent screenshots when viewing revealed media
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (visible && remoteImages.length > 0) {
            ScreenCapture.preventScreenCaptureAsync('peepDeck');
        } else {
            ScreenCapture.allowScreenCaptureAsync('peepDeck');
        }
        return () => {
            ScreenCapture.allowScreenCaptureAsync('peepDeck');
        };
    }, [visible, remoteImages.length]);

    if (!visible) return null;

    // Watermark overlay component
    const Watermark = () => (
        <View style={styles.watermarkOverlay} pointerEvents="none">
            {[0, 1, 2, 3, 4].map(i => (
                <Text key={i} style={styles.watermarkText}>PIQABU</Text>
            ))}
        </View>
    );


    // Focus modal (expanded view)
    if (focusedItem) {
        const focusResolved = resolveUri(focusedItem);
        const focusIsVideo = isVideoUri(focusedItem);
        const focusIsAudio = isAudioUri(focusedItem);
        const focusIsPdf = isPdfUri(focusedItem);
        const focusIsDoc = isDocUri(focusedItem);
        return (
            <>
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
                                ref={videoRef}
                                source={{ uri: focusResolved }}
                                style={styles.focusImage}
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay={false}
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
                        ) : focusIsPdf ? (
                            // On-device PDF rendering. The file streams from
                            // the Piqabu server straight to the device's PDF
                            // engine — no third party (Google Docs, etc.)
                            // sees the bytes.
                            <View style={{ flex: 1, width: '100%' }}>
                                <DocumentViewer uri={focusResolved} />
                                <Watermark />
                                {/* SIGN & RETURN — v1 type-name signature
                                    flow. Only render when the parent wired
                                    onSign (sendText callback in /room). */}
                                {onSign && (
                                    <TouchableOpacity
                                        onPress={() => setSignatureVisible(true)}
                                        style={styles.signButton}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="create-outline" size={14} color={THEME.bg} />
                                        <Text style={styles.signButtonText}>SIGN & RETURN</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : focusIsDoc ? (
                            // Non-PDF documents (DOCX, XLSX, etc.) are
                            // intentionally not rendered in v1. The picker
                            // is filtered to PDF, so this path is defensive.
                            <View style={styles.pdfFocusCard}>
                                <Ionicons name="document-text" size={56} color={THEME.accSky} />
                                <Text style={styles.audioFocusLabel}>UNSUPPORTED FORMAT</Text>
                                <Text style={styles.pdfFocusSub}>Only PDF documents are supported in this version. Ask your correspondent to share a PDF.</Text>
                            </View>
                        ) : (
                            <Image source={{ uri: focusResolved }} style={styles.focusImage} resizeMode="contain" />
                        )}
                        <Watermark />
                    </View>
                </View>
            </Modal>

            {/* SIGN & RETURN modal — mounted alongside the focus modal so
                it can overlay the PDF view. Sends back a formatted
                "✓ SIGNED · ..." line via the parent's sendText. */}
            <SignatureModal
                visible={signatureVisible}
                onDismiss={() => setSignatureVisible(false)}
                onSign={(line) => onSign?.(line)}
            />
            </>
        );
    }

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={trayHeight != null ? 'box-none' : 'auto'}>
            {/* Backdrop — only in floating-sheet mode. In tray mode the feed
                + compose above stay visible/usable, so no dim + no capture. */}
            {trayHeight == null && (
                <RNAnimated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                </RNAnimated.View>
            )}

            {/* Card (floating sheet) or bottom-docked tray */}
            <RNAnimated.View style={[
                styles.card,
                trayHeight != null && {
                    left: 0, right: 0, bottom: 0, height: trayHeight, maxHeight: undefined as any,
                    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                },
                { transform: [{ translateY: slideAnim }] },
            ]}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>PEEK ROOM</Text>
                        <Text style={styles.headerSub}>VIEW ONLY • NO TRACE</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>FOLD SHUT</Text>
                    </TouchableOpacity>
                </View>

                {/* Grid — the full session gallery. Each cell is a uniform
                    tile; tap to focus (full view / playback). */}
                <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
                    {remoteImages.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="eye-off-outline" size={32} color={THEME.faint} />
                            <Text style={styles.emptyText}>NOTHING SHOWN... YET</Text>
                        </View>
                    ) : (
                        remoteImages.map((uri, i) => {
                            const cellResolved = resolveUri(uri);
                            const cellIsVideo = isVideoUri(uri);
                            const cellIsAudio = isAudioUri(uri);
                            const cellIsPdf = isPdfUri(uri);
                            const cellIsDoc = isDocUri(uri);
                            const key = `${i}-${uri.slice(0, 24)}`;

                            if (cellIsAudio) {
                                return (
                                    <TouchableOpacity
                                        key={key}
                                        onPress={() => setFocusedItem(uri)}
                                        style={styles.tileCard}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="musical-notes" size={30} color={THEME.accSky} />
                                        <Text style={styles.tileSub}>TAP TO PLAY</Text>
                                        <Watermark />
                                        <View style={styles.gridItemLabel}>
                                            <Text style={styles.gridItemType}>AUDIO</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }
                            if (cellIsPdf || cellIsDoc) {
                                return (
                                    <TouchableOpacity
                                        key={key}
                                        onPress={() => setFocusedItem(uri)}
                                        style={styles.tileCard}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="document-text" size={30} color={THEME.accSky} />
                                        <Text style={styles.tileSub}>TAP TO VIEW</Text>
                                        <Watermark />
                                        <View style={styles.gridItemLabel}>
                                            <Text style={styles.gridItemType}>{cellIsPdf ? 'PDF' : 'DOC'}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }
                            if (cellIsVideo) {
                                return (
                                    <TouchableOpacity
                                        key={key}
                                        onPress={() => setFocusedItem(uri)}
                                        style={styles.tileCard}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="play-circle" size={34} color={THEME.ink} />
                                        <Text style={styles.tileSub}>TAP TO PLAY</Text>
                                        <Watermark />
                                        <View style={styles.gridItemLabel}>
                                            <Text style={styles.gridItemType}>VIDEO</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }
                            return (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => setFocusedItem(uri)}
                                    style={styles.gridItem}
                                    activeOpacity={0.8}
                                >
                                    <Image source={{ uri: cellResolved }} style={styles.gridImage} resizeMode="cover" />
                                    <Watermark />
                                    <View style={styles.gridItemLabel}>
                                        <Text style={styles.gridItemType}>IMAGE</Text>
                                    </View>
                                    {/* Phase 1 of the deepfake-detection spec — runs the
                                        on-device synthesis classifier on every received
                                        still image. Indicator only renders if the
                                        computed score crosses SILENT (0.30). Currently
                                        running the stub engine — see
                                        lib/detection/synthesisDetector.ts for swap-in
                                        instructions when the real TFLite model lands. */}
                                    <SynthesisIndicator imageUri={uri} placement="top-right" />
                                </TouchableOpacity>
                            );
                        })
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
        // Responsive: the sheet grows to fit its content (a single image
        // stays compact) and caps at 82% so it never swallows the whole
        // screen. Was top:100 (near-full-screen).
        maxHeight: '82%',
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
        // flexShrink (not flex:1) lets the scroll body size to its content
        // for the responsive sheet, while still scrolling when content
        // exceeds the card's maxHeight cap.
        flexShrink: 1,
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
    // Uniform non-image tile (audio / doc / video) — same footprint as a
    // gridItem so the gallery reads as a clean grid.
    tileCard: {
        width: '31%',
        aspectRatio: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.25)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    tileSub: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.1,
        color: THEME.faint,
        textTransform: 'uppercase',
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
    signButton: {
        position: 'absolute',
        bottom: 26,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: THEME.ink,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 12,
    },
    signButtonText: {
        fontFamily: THEME.mono,
        color: THEME.bg,
        fontSize: 11,
        letterSpacing: 2.5,
        fontWeight: '900',
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
