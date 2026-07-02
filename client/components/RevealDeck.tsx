import React, { useState, useRef, useEffect } from 'react';
import {
    View, Image, TouchableOpacity, Text, StyleSheet, Alert, ScrollView,
    Animated as RNAnimated, Platform, ActivityIndicator, ActionSheetIOS,
    useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Video, ResizeMode } from 'expo-av';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import { uploadFile } from '../lib/uploadFile';
import { useSecurity } from '../contexts/SecurityContext';

const MAX_MEDIA_SIZE = 12 * 1024 * 1024; // 12MB base64 data URI (~8MB binary)

type MediaType = 'image' | 'video' | 'audio' | 'pdf' | 'document';
type EvidenceItem = { id: string; uri: string; localUri?: string; type: MediaType };

let _idCounter = 0;
function nextId(): string {
    return `ev_${Date.now()}_${++_idCounter}`;
}

function isVideoUri(uri: string): boolean {
    return uri.startsWith('data:video/') || /\.(mp4|mov|avi|webm)$/i.test(uri);
}

function getMimeFromExtension(ext?: string): string {
    if (!ext) return 'application/octet-stream';
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain',
        csv: 'text/csv',
        rtf: 'application/rtf',
        json: 'application/json',
        xml: 'application/xml',
        zip: 'application/zip',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        aac: 'audio/aac',
        ogg: 'audio/ogg',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        webm: 'video/webm',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
}

function getMediaTypeFromMime(mime: string): MediaType {
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('image/')) return 'image';
    return 'document';
}

export default function RevealDeck({
    visible, onClose, onReveal, roomId, maxImages = 10, onVideoControl,
}: {
    visible: boolean;
    onClose: () => void;
    onReveal: (payload: string | null, action?: 'show' | 'cover' | 'coverAll') => void;
    roomId: string;
    maxImages?: number;
    onVideoControl?: (controls: { action: string; position?: number }) => void;
}) {
    const [items, setItems] = useState<EvidenceItem[]>([]);
    // Set of item ids currently shown to the partner. Multiple can be
    // shown at once; the partner's Peek gallery mirrors exactly this set.
    const [exposedIds, setExposedIds] = useState<Set<string>>(new Set());
    const [uploading, setUploading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoPosition, setVideoPosition] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const videoRef = useRef<any>(null);
    const slideAnim = useRef(new RNAnimated.Value(600)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;

    // Responsive media-preview height — a fraction of the screen, clamped,
    // so on short phones it doesn't crowd out the list + footer.
    const { height: winH } = useWindowDimensions();
    const previewHeight = Math.max(140, Math.min(280, Math.round(winH * 0.28)));

    const { setFilePickerActive } = useSecurity();

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

    // --- Pick media (images/videos) ---
    const pickMedia = async () => {
        if (items.length >= maxImages) {
            Alert.alert('Limit Reached', `Maximum ${maxImages} items allowed.`);
            return;
        }

        try {
            setFilePickerActive(true);
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                setFilePickerActive(false);
                Alert.alert('Permission Required', 'Please allow access to your media library in Settings.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                base64: true,
                quality: 0.5,
                videoMaxDuration: 30,
            });
            setFilePickerActive(false);

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            const isVideo = asset.type === 'video';

            if (isVideo) {
                if (!asset.uri) return;
                const mime = asset.mimeType || 'video/mp4';
                const fileName = asset.fileName || `video_${Date.now()}.mp4`;

                // Upload video via HTTP (much more reliable than base64 through socket)
                setUploading(true);
                const uploadResult = await uploadFile(asset.uri, fileName, mime, roomId);
                setUploading(false);

                if ('error' in uploadResult) {
                    Alert.alert('Upload Failed', uploadResult.error);
                    return;
                }

                setItems(prev => [...prev, {
                    id: nextId(),
                    uri: uploadResult.url,        // Server URL for socket transmission
                    localUri: asset.uri,           // Local URI for preview playback
                    type: 'video',
                }]);
            } else {
                // Image: use base64 from picker (small enough for socket)
                if (!asset.base64) return;
                const mime = asset.mimeType || 'image/jpeg';
                let dataUri = `data:${mime};base64,${asset.base64}`;

                if (dataUri.length > MAX_MEDIA_SIZE) {
                    const lowRes = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'],
                        base64: true,
                        quality: 0.15,
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
        } catch (e: any) {
            setUploading(false);
            console.warn('[RevealDeck] pickMedia error:', e?.message, e);
            Alert.alert('Error', 'Could not load media. Please try again.');
        }
    };

    // --- Pick document (PDF for v1; other types in a future build) ---
    const pickDocument = async () => {
        if (items.length >= maxImages) {
            Alert.alert('Limit Reached', `Maximum ${maxImages} items allowed.`);
            return;
        }

        try {
            setFilePickerActive(true);
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
                multiple: false,
            });
            setFilePickerActive(false);

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            const fileName = asset.name || `document_${Date.now()}.pdf`;
            const mime = asset.mimeType || 'application/pdf';

            // Hard-gate to PDF for v1. expo-document-picker's `type` filter
            // is best-effort on Android — verify on the receiving side too.
            if (!fileName.toLowerCase().endsWith('.pdf') && mime !== 'application/pdf') {
                Alert.alert(
                    'PDF Only For Now',
                    'Document sharing currently supports PDF. Other formats (DOCX, XLSX) are coming soon.',
                    [{ text: 'GOT IT' }]
                );
                return;
            }

            // Size guard — server caps uploads at 15MB.
            if (asset.size && asset.size > 14 * 1024 * 1024) {
                Alert.alert('File Too Large', 'Documents must be under 14MB.');
                return;
            }

            setUploading(true);
            const uploadResult = await uploadFile(asset.uri, fileName, mime, roomId);
            setUploading(false);

            if ('error' in uploadResult) {
                Alert.alert('Upload Failed', uploadResult.error);
                return;
            }

            setItems(prev => [...prev, {
                id: nextId(),
                uri: uploadResult.url,
                localUri: asset.uri,
                type: 'pdf',
            }]);
        } catch (e: any) {
            setUploading(false);
            setFilePickerActive(false);
            console.warn('[RevealDeck] pickDocument error:', e?.message, e);
            Alert.alert('Error', 'Could not load document. Please try again.');
        }
    };
    const handleAddAttachment = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Photo / Video', 'PDF Document'],
                    cancelButtonIndex: 0,
                },
                (buttonIndex) => {
                    if (buttonIndex === 1) pickMedia();
                    else if (buttonIndex === 2) pickDocument();
                }
            );
        } else {
            Alert.alert(
                'Add Attachment',
                'Select the type of file you want to load',
                [
                    { text: 'Photo / Video', onPress: pickMedia },
                    { text: 'PDF Document', onPress: pickDocument },
                    { text: 'Cancel', style: 'cancel' }
                ],
                { cancelable: true }
            );
        }
    };

    // Multi-select expose: each item toggles independently. SHOW adds it
    // to the partner's Peek gallery; COVER removes that specific item.
    const toggleExpose = (id: string) => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        setExposedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                onReveal(item.uri, 'cover');
            } else {
                next.add(id);
                onReveal(item.uri, 'show');
            }
            return next;
        });
    };

    const removeItem = (id: string) => {
        const item = items.find(i => i.id === id);
        // If it's currently shown, cover it on the partner's side first.
        if (item && exposedIds.has(id)) onReveal(item.uri, 'cover');
        setItems(prev => prev.filter(i => i.id !== id));
        setExposedIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const clearAll = () => {
        setItems([]);
        setExposedIds(new Set());
        onReveal(null, 'coverAll');
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
                            ITEMS: {items.length} • SHOWN: {exposedIds.size}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                {/* Upload indicator */}
                {uploading && (
                    <View style={styles.uploadingBar}>
                        <ActivityIndicator size="small" color={THEME.ink} />
                        <Text style={styles.uploadingText}>UPLOADING...</Text>
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity onPress={handleAddAttachment} style={styles.actionBtn} activeOpacity={0.7} disabled={uploading}>
                        <Ionicons name="attach-outline" size={14} color={THEME.ink} />
                        <Text style={styles.actionBtnText}>ADD ATTACHMENT</Text>
                    </TouchableOpacity>

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
                            <Text style={styles.emptyText}>NOTHING HERE YET</Text>
                        </View>
                    ) : (
                        items.map((item, idx) => {
                            const isExposed = exposedIds.has(item.id);
                            return (
                                <View key={item.id} style={styles.evidenceRow}>
                                    {/* Thumbnail */}
                                    <View style={styles.thumb}>
                                        {item.type === 'video' ? (
                                            <View style={styles.videoThumb}>
                                                <Ionicons name="videocam" size={22} color={THEME.muted} />
                                            </View>
                                        ) : item.type === 'audio' ? (
                                            <View style={styles.videoThumb}>
                                                <Ionicons name="musical-notes" size={22} color={THEME.muted} />
                                            </View>
                                        ) : item.type === 'pdf' ? (
                                            <View style={styles.videoThumb}>
                                                <Ionicons name="document-text" size={22} color={THEME.muted} />
                                            </View>
                                        ) : item.type === 'document' ? (
                                            <View style={styles.videoThumb}>
                                                <Ionicons name="document-outline" size={22} color={THEME.muted} />
                                            </View>
                                        ) : (
                                            <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                                        )}
                                    </View>

                                    {/* Meta */}
                                    <View style={styles.meta}>
                                        <Text style={styles.metaTitle}>ITEM {idx + 1}</Text>
                                        <View style={styles.metaRow}>
                                            <Text style={styles.metaType}>
                                                {item.type === 'video' ? 'VIDEO' : item.type === 'audio' ? 'AUDIO' : item.type === 'pdf' ? 'PDF' : item.type === 'document' ? 'DOCUMENT' : 'IMAGE'}
                                            </Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={[styles.metaStatus, isExposed && { color: THEME.accEmerald }]}>
                                                {isExposed ? 'SHOWN' : 'HIDDEN'}
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
                                            {isExposed ? 'COVER' : 'SHOW'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                {/* Video/Audio Preview for exposed media. When several items
                    are shown, preview the first exposed video/audio so the
                    sender keeps playback control of it. */}
                {(() => {
                    const exposedItem = items.find(i => exposedIds.has(i.id) && (i.type === 'video' || i.type === 'audio'));
                    if (!exposedItem) return null;
                    const playbackUri = exposedItem.localUri || exposedItem.uri;
                    const formatTime = (ms: number) => {
                        const s = Math.floor(ms / 1000);
                        const m = Math.floor(s / 60);
                        return `${m}:${String(s % 60).padStart(2, '0')}`;
                    };
                    return (
                        <View style={[styles.videoPreview, { height: previewHeight }]}>
                            <Video
                                ref={videoRef}
                                source={{ uri: playbackUri }}
                                style={styles.videoPlayer}
                                useNativeControls={false}
                                resizeMode={ResizeMode.CONTAIN}
                                isLooping={false}
                                shouldPlay={isPlaying}
                                onPlaybackStatusUpdate={(status: any) => {
                                    if (status.isLoaded) {
                                        setIsPlaying(status.isPlaying);
                                        if (!isSeeking) {
                                            setVideoPosition(status.positionMillis || 0);
                                        }
                                        if (status.durationMillis) {
                                            setVideoDuration(status.durationMillis);
                                        }
                                    }
                                }}
                            />
                            <View style={styles.videoControlBar}>
                                {/* Time + seek bar */}
                                <View style={styles.seekRow}>
                                    <Text style={styles.timeText}>{formatTime(videoPosition)}</Text>
                                    <Slider
                                        style={styles.seekSlider}
                                        minimumValue={0}
                                        maximumValue={videoDuration || 1}
                                        value={videoPosition}
                                        onSlidingStart={() => setIsSeeking(true)}
                                        onSlidingComplete={async (val: number) => {
                                            setIsSeeking(false);
                                            if (videoRef.current) {
                                                await videoRef.current.setPositionAsync(val);
                                                onVideoControl?.({ action: 'seek', position: val });
                                            }
                                        }}
                                        minimumTrackTintColor="rgba(255,255,255,0.7)"
                                        maximumTrackTintColor="rgba(255,255,255,0.15)"
                                        thumbTintColor="#fff"
                                    />
                                    <Text style={styles.timeText}>{formatTime(videoDuration)}</Text>
                                </View>
                                {/* Transport buttons */}
                                <View style={styles.transportRow}>
                                    {/* Restart */}
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!videoRef.current) return;
                                            await videoRef.current.setPositionAsync(0);
                                            onVideoControl?.({ action: 'seek', position: 0 });
                                        }}
                                        style={styles.videoControlBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="play-skip-back" size={14} color="#fff" />
                                    </TouchableOpacity>
                                    {/* Rewind 10s */}
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!videoRef.current) return;
                                            const newPos = Math.max(0, videoPosition - 10000);
                                            await videoRef.current.setPositionAsync(newPos);
                                            onVideoControl?.({ action: 'seek', position: newPos });
                                        }}
                                        style={styles.videoControlBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="play-back" size={14} color="#fff" />
                                    </TouchableOpacity>
                                    {/* Play / Pause */}
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!videoRef.current) return;
                                            if (isPlaying) {
                                                await videoRef.current.pauseAsync();
                                                onVideoControl?.({ action: 'pause' });
                                            } else {
                                                await videoRef.current.playAsync();
                                                onVideoControl?.({ action: 'play' });
                                            }
                                        }}
                                        style={[styles.videoControlBtn, styles.playPauseBtn]}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#000" />
                                    </TouchableOpacity>
                                    {/* Forward 10s */}
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!videoRef.current) return;
                                            const newPos = Math.min(videoDuration, videoPosition + 10000);
                                            await videoRef.current.setPositionAsync(newPos);
                                            onVideoControl?.({ action: 'seek', position: newPos });
                                        }}
                                        style={styles.videoControlBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="play-forward" size={14} color="#fff" />
                                    </TouchableOpacity>
                                    {/* Skip to end */}
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!videoRef.current) return;
                                            await videoRef.current.setPositionAsync(videoDuration);
                                            onVideoControl?.({ action: 'seek', position: videoDuration });
                                        }}
                                        style={styles.videoControlBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="play-skip-forward" size={14} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    );
                })()}

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        SHOW = VISIBLE IN THEIR PEEK ROOM. COVER = HIDDEN.
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
        // Responsive sheet — sizes to content, caps at 82% (was top:100,
        // which made it near-full-screen).
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
    uploadingBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    uploadingText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.22,
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
    list: {
        // flexShrink (not flex:1) so the sheet sizes to content yet the
        // list still scrolls within the maxHeight cap.
        flexShrink: 1,
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
        // Height is applied responsively inline (previewHeight); this is a
        // fallback for any static render.
        height: 280,
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
    videoControlBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(0,0,0,0.7)',
        gap: 6,
    },
    seekRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    seekSlider: {
        flex: 1,
        height: 24,
    },
    timeText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.7)',
        minWidth: 30,
        textAlign: 'center',
    },
    transportRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    videoControlBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playPauseBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
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
