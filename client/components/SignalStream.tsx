import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenCapture from 'expo-screen-capture';
import { ResizeMode, Video } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONFIG } from '../constants/Config';
import { THEME } from '../constants/Theme';
import { useSecurity } from '../contexts/SecurityContext';
import type { RemoteStreamItem } from '../hooks/useRoom';
import { uploadFile } from '../lib/uploadFile';
import DocumentViewer from './DocumentViewer';
import SandText from './SandText';
import SignatureModal from './SignatureModal';
import SynthesisIndicator from './SynthesisIndicator';

type MediaKind = 'image' | 'video' | 'pdf';
type AttachmentStatus = 'staged' | 'uploading' | 'shown' | 'failed';

interface ComposerAttachment {
    id: string;
    kind: MediaKind;
    localUri: string;
    fileName: string;
    mimeType: string;
    size?: number;
    remoteUri?: string;
    status: AttachmentStatus;
    error?: string;
}

interface SignalStreamProps {
    roomId: string;
    remoteText: string;
    remoteTextRevision: number;
    remoteStream: RemoteStreamItem[];
    remoteDecayText: string | null;
    remoteSandActive: boolean;
    localDecayText: string | null;
    localSandActive: boolean;
    localText: string;
    textLimit: number;
    vanishDuration: number;
    isPartnerTyping: boolean;
    keyboardVisible: boolean;
    onChangeText: (text: string) => void;
    onShow: (payload: string, itemId: string) => void;
    onCover: (payload: string, itemId: string) => void;
    onClearStream: () => void;
    onCycleVanish: () => void;
    whisperState: 'idle' | 'invited' | 'connecting' | 'live' | 'speaking' | 'error';
    onWhisperTap: () => void;
    onWhisperHoldChange: (holding: boolean) => void;
    onOpenLive: () => void;
    videoPlaybackControl?: { action: string; position?: number; itemId?: string } | null;
    onVideoControl?: (control: { action: 'play' | 'pause' | 'seek'; position?: number; itemId?: string }) => void;
    onSign?: (line: string) => void;
    onLocalSandComplete: () => void;
}

const MAX_ATTACHMENTS = 10;
const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;

function nextId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function hasExtension(uri: string, extensions: string[]): boolean {
    const clean = uri.split(/[?#]/, 1)[0];
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch {}
    const extension = decoded.split('.').pop()?.toLowerCase();
    return extension ? extensions.includes(extension) : false;
}

function kindFromUri(uri: string): MediaKind {
    if (uri.startsWith('data:video/') || hasExtension(uri, ['mp4', 'mov', 'm4v', 'webm', 'avi'])) return 'video';
    if (uri.startsWith('data:application/pdf') || hasExtension(uri, ['pdf'])) return 'pdf';
    return 'image';
}

function resolveUri(uri: string): string {
    return uri.startsWith('/uploads/') ? `${CONFIG.SIGNAL_TOWER_URL}${uri}` : uri;
}

function ArchiveTexture() {
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.archiveRule, { top: '18%' }]} />
            <View style={[styles.archiveRule, { top: '53%', opacity: 0.035 }]} />
            <View style={[styles.archiveRule, { top: '81%', opacity: 0.025 }]} />
            <View style={styles.registrationMarkTop} />
            <View style={styles.registrationMarkBottom} />
        </View>
    );
}

function Watermark() {
    return (
        <View style={styles.watermark} pointerEvents="none">
            <Text style={styles.watermarkText}>PIQABU · SHOWN</Text>
            <Text style={styles.watermarkText}>PIQABU · SHOWN</Text>
            <Text style={styles.watermarkText}>PIQABU · SHOWN</Text>
        </View>
    );
}

function InlineMediaCard({
    item,
    opened,
    onOpen,
    videoPlaybackControl,
}: {
    item: Extract<RemoteStreamItem, { type: 'media' }>;
    opened: boolean;
    onOpen: () => void;
    videoPlaybackControl?: { action: string; position?: number; itemId?: string } | null;
}) {
    const kind = kindFromUri(item.uri);
    const uri = resolveUri(item.uri);
    const videoRef = useRef<any>(null);
    const [isBuffering, setIsBuffering] = useState(false);

    useEffect(() => {
        if (!videoPlaybackControl || !videoRef.current || kind !== 'video') return;
        if (videoPlaybackControl.itemId && item.id !== `media:${videoPlaybackControl.itemId}`) return;
        if (videoPlaybackControl.action === 'play') videoRef.current.playAsync?.();
        if (videoPlaybackControl.action === 'pause') videoRef.current.pauseAsync?.();
        if (videoPlaybackControl.action === 'seek' && videoPlaybackControl.position != null) {
            videoRef.current.setPositionAsync?.(videoPlaybackControl.position);
        }
    }, [item.id, kind, opened, videoPlaybackControl]);

    if (!opened) {
        return (
            <TouchableOpacity
                onPress={onOpen}
                style={styles.sealedCard}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={kind === 'video' ? 'Video shown. Tap to open the sender-controlled player.' : `${kind} shown. Tap to peek.`}
            >
                <View style={styles.sealedStamp}>
                    <Text style={styles.sealedStampText}>OBJECT SHOWN</Text>
                </View>
                <View style={styles.sealedIconWrap}>
                    <Ionicons
                        name={kind === 'video' ? 'play' : kind === 'pdf' ? 'document-text-outline' : 'eye-outline'}
                        size={kind === 'video' ? 30 : 24}
                        color={THEME.ink}
                    />
                </View>
                <View style={styles.sealedCopy}>
                    <Text style={styles.sealedTitle}>{kind === 'video' ? 'VIDEO SIGNAL' : kind === 'pdf' ? 'DOCUMENT SIGNAL' : 'IMAGE SIGNAL'}</Text>
                    <Text style={styles.sealedSub}>{kind === 'video' ? 'TAP TO OPEN · SENDER CONTROLLED' : 'TAP TO PEEK'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={THEME.faint} />
            </TouchableOpacity>
        );
    }

    if (kind === 'video') {
        return (
            <View style={styles.openMediaCard}>
                <Video
                    ref={videoRef}
                    source={{ uri }}
                    style={styles.inlineVideo}
                    resizeMode={ResizeMode.CONTAIN}
                    useNativeControls={false}
                    shouldPlay={false}
                    pointerEvents="none"
                    onPlaybackStatusUpdate={(status: any) => {
                        if (!status?.isLoaded) {
                            setIsBuffering(Boolean(status?.isBuffering));
                            return;
                        }
                        setIsBuffering(Boolean(status.isBuffering));
                    }}
                />
                {isBuffering && (
                    <View style={styles.videoBuffering} pointerEvents="none">
                        <ActivityIndicator color={THEME.ink} />
                    </View>
                )}
                <View style={styles.openMediaLabel}><Text style={styles.openMediaLabelText}>VIDEO · SENDER CONTROLLED</Text></View>
                <Watermark />
            </View>
        );
    }

    if (kind === 'pdf') {
        return (
            <TouchableOpacity onPress={onOpen} style={styles.documentCard} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={28} color={THEME.ink} />
                <View style={styles.sealedCopy}>
                    <Text style={styles.sealedTitle}>DOCUMENT OPEN</Text>
                    <Text style={styles.sealedSub}>TAP TO VIEW FULL SCREEN</Text>
                </View>
                <Ionicons name="expand-outline" size={18} color={THEME.faint} />
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity onPress={onOpen} style={styles.openMediaCard} activeOpacity={0.95}>
            <Image source={{ uri }} style={styles.inlineImage} resizeMode="contain" />
            <Watermark />
            <SynthesisIndicator imageUri={item.uri} placement="top-right" />
        </TouchableOpacity>
    );
}

export default function SignalStream({
    roomId,
    remoteText,
    remoteTextRevision,
    remoteStream,
    remoteDecayText,
    remoteSandActive,
    localDecayText,
    localSandActive,
    localText,
    textLimit,
    vanishDuration,
    isPartnerTyping,
    keyboardVisible,
    onChangeText,
    onShow,
    onCover,
    onClearStream,
    onCycleVanish,
    whisperState,
    onWhisperTap,
    onWhisperHoldChange,
    onOpenLive,
    videoPlaybackControl,
    onVideoControl,
    onSign,
    onLocalSandComplete,
}: SignalStreamProps) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const { setFilePickerActive } = useSecurity();
    const listRef = useRef<FlatList<RemoteStreamItem>>(null);
    const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
    const [actionsVisible, setActionsVisible] = useState(false);
    const [composerHeight, setComposerHeight] = useState(88);
    const [nearBottom, setNearBottom] = useState(true);
    const [showLiveJump, setShowLiveJump] = useState(false);
    const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
    const [focusedUri, setFocusedUri] = useState<string | null>(null);
    const [signatureVisible, setSignatureVisible] = useState(false);
    const [playingAttachmentIds, setPlayingAttachmentIds] = useState<Set<string>>(new Set());
    const lastSignalKey = useRef('');
    const previousRemoteText = useRef('');

    const compact = height < 720;
    const readableWidth = Math.min(width, 720);
    const composerBottom = keyboardVisible ? 8 : Math.max(insets.bottom, 8);
    const composerMaxHeight = Math.max(
        176,
        Math.min(compact ? 254 : 316, height - insets.top - composerBottom - 82),
    );

    const liveItem = useMemo<RemoteStreamItem | null>(() => {
        const text = remoteSandActive && remoteDecayText ? remoteDecayText : remoteText;
        return text ? {
            id: `live-text:${remoteTextRevision}`,
            type: 'text',
            text,
            createdAt: Date.now(),
            expiresAt: null,
        } : null;
    }, [remoteDecayText, remoteSandActive, remoteText, remoteTextRevision]);

    const streamData = useMemo(
        () => liveItem ? [...remoteStream, liveItem] : remoteStream,
        [liveItem, remoteStream],
    );

    useEffect(() => {
        const key = `${streamData.length}:${remoteText.length}:${remoteText.slice(-12)}`;
        if (key === lastSignalKey.current) return;
        lastSignalKey.current = key;
        if (nearBottom) {
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        } else {
            setShowLiveJump(true);
        }
    }, [nearBottom, remoteText, streamData.length]);

    // The first character after a shown object starts a new live block.
    // Surface it immediately below the object even if the media expansion
    // changed the list's measured bottom while the receiver was watching.
    useEffect(() => {
        const beginsNewBlock = previousRemoteText.current.length === 0 && remoteText.length > 0;
        previousRemoteText.current = remoteText;
        if (!beginsNewBlock || remoteTextRevision === 0) return;
        setNearBottom(true);
        setShowLiveJump(false);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }, [remoteText, remoteTextRevision]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'background' || state === 'inactive') {
                setAttachments([]);
                setOpenedIds(new Set());
                setFocusedUri(null);
                setActionsVisible(false);
            }
        });
        return () => sub.remove();
    }, []);

    const hasOpenMedia = openedIds.size > 0 || Boolean(focusedUri);
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (Platform.OS === 'ios') {
            ScreenCapture.allowScreenCaptureAsync('signalStream').catch(() => {});
            if (hasOpenMedia) ScreenCapture.enableAppSwitcherProtectionAsync(0.85).catch(() => {});
            else ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
            return () => { ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {}); };
        }
        if (hasOpenMedia) ScreenCapture.preventScreenCaptureAsync('signalStream').catch(() => {});
        else ScreenCapture.allowScreenCaptureAsync('signalStream').catch(() => {});
        return () => { ScreenCapture.allowScreenCaptureAsync('signalStream').catch(() => {}); };
    }, [hasOpenMedia]);

    useEffect(() => {
        const activeMediaIds = new Set(remoteStream.filter((item) => item.type === 'media').map((item) => item.id));
        setOpenedIds((prev) => new Set([...prev].filter((id) => activeMediaIds.has(id))));
        if (focusedUri && !remoteStream.some((item) => item.type === 'media' && item.uri === focusedUri)) {
            setFocusedUri(null);
        }
    }, [focusedUri, remoteStream]);

    const addAttachment = useCallback((attachment: Omit<ComposerAttachment, 'id' | 'status'>) => {
        setAttachments((prev) => {
            if (prev.length >= MAX_ATTACHMENTS) {
                Alert.alert('Attachment limit', `You can stage up to ${MAX_ATTACHMENTS} objects at once.`);
                return prev;
            }
            return [...prev, { ...attachment, id: nextId(), status: 'staged' }];
        });
    }, []);

    const pickMedia = useCallback(async (source: 'camera' | 'library') => {
        try {
            setFilePickerActive(true);
            const permission = source === 'camera'
                ? await ImagePicker.requestCameraPermissionsAsync()
                : await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permission required', `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to stage an object.`);
                return;
            }
            const result = source === 'camera'
                ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.72, videoMaxDuration: 30 })
                : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.72, videoMaxDuration: 30 });
            if (result.canceled || !result.assets?.[0]) return;
            const asset = result.assets[0];
            const kind: MediaKind = asset.type === 'video' ? 'video' : 'image';
            const fallbackExt = kind === 'video' ? 'mp4' : 'jpg';
            const mimeType = asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
            const size = (asset as any).fileSize as number | undefined;
            if (size && size > MAX_UPLOAD_BYTES) {
                Alert.alert('Object too large', 'Shown objects must be under 14 MB. Choose a smaller file or shorter video.');
                return;
            }
            addAttachment({
                kind,
                localUri: asset.uri,
                fileName: asset.fileName || `${kind}_${Date.now()}.${fallbackExt}`,
                mimeType,
                size,
            });
        } catch (error: any) {
            console.warn('[SignalStream] media picker failed:', error?.message);
            Alert.alert('Could not stage object', 'Try the picker again. Nothing was uploaded.');
        } finally {
            setFilePickerActive(false);
            setActionsVisible(false);
        }
    }, [addAttachment, setFilePickerActive]);

    const pickDocument = useCallback(async () => {
        try {
            setFilePickerActive(true);
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (result.canceled || !result.assets?.[0]) return;
            const asset = result.assets[0];
            if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
                Alert.alert('Object too large', 'Documents must be under 14 MB.');
                return;
            }
            addAttachment({
                kind: 'pdf',
                localUri: asset.uri,
                fileName: asset.name || `document_${Date.now()}.pdf`,
                mimeType: asset.mimeType || 'application/pdf',
                size: asset.size,
            });
        } catch (error: any) {
            console.warn('[SignalStream] document picker failed:', error?.message);
            Alert.alert('Could not stage document', 'Try the picker again. Nothing was uploaded.');
        } finally {
            setFilePickerActive(false);
            setActionsVisible(false);
        }
    }, [addAttachment, setFilePickerActive]);

    const showAttachment = useCallback(async (id: string) => {
        const item = attachments.find((candidate) => candidate.id === id);
        if (!item || item.status === 'uploading' || item.status === 'shown') return;
        setAttachments((prev) => prev.map((candidate) => candidate.id === id
            ? { ...candidate, status: 'uploading', error: undefined }
            : candidate));

        let remoteUri = item.remoteUri;
        if (!remoteUri) {
            const result = await uploadFile(item.localUri, item.fileName, item.mimeType, roomId);
            if ('error' in result) {
                setAttachments((prev) => prev.map((candidate) => candidate.id === id
                    ? { ...candidate, status: 'failed', error: result.error }
                    : candidate));
                Alert.alert('Show failed', result.error);
                return;
            }
            remoteUri = result.url;
        }

        onShow(remoteUri, item.id);
        setAttachments((prev) => prev.map((candidate) => candidate.id === id
            ? { ...candidate, remoteUri, status: 'shown', error: undefined }
            : candidate));
    }, [attachments, onShow, roomId]);

    const coverAttachment = useCallback((id: string) => {
        const item = attachments.find((candidate) => candidate.id === id);
        if (!item?.remoteUri) return;
        if (item.kind === 'video' && playingAttachmentIds.has(id)) {
            onVideoControl?.({ action: 'pause', itemId: id });
            setPlayingAttachmentIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
        onCover(item.remoteUri, item.id);
        setAttachments((prev) => prev.map((candidate) => candidate.id === id
            ? { ...candidate, status: 'staged', remoteUri: undefined }
            : candidate));
    }, [attachments, onCover, onVideoControl, playingAttachmentIds]);

    const removeAttachment = useCallback((id: string) => {
        const item = attachments.find((candidate) => candidate.id === id);
        if (item?.kind === 'video' && playingAttachmentIds.has(id)) {
            onVideoControl?.({ action: 'pause', itemId: id });
        }
        if (item?.status === 'shown' && item.remoteUri) onCover(item.remoteUri, item.id);
        setPlayingAttachmentIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setAttachments((prev) => prev.filter((candidate) => candidate.id !== id));
    }, [attachments, onCover, onVideoControl, playingAttachmentIds]);

    const toggleVideoPlayback = useCallback((item: ComposerAttachment) => {
        if (item.kind !== 'video' || item.status !== 'shown') return;
        const isPlaying = playingAttachmentIds.has(item.id);
        onVideoControl?.({ action: isPlaying ? 'pause' : 'play', itemId: item.id });
        setPlayingAttachmentIds((prev) => {
            const next = new Set(prev);
            if (isPlaying) next.delete(item.id);
            else next.add(item.id);
            return next;
        });
    }, [onVideoControl, playingAttachmentIds]);

    const openMedia = useCallback((item: Extract<RemoteStreamItem, { type: 'media' }>) => {
        const kind = kindFromUri(item.uri);
        if (openedIds.has(item.id)) {
            setFocusedUri(item.uri);
            return;
        }
        setOpenedIds((prev) => new Set(prev).add(item.id));
        if (kind === 'pdf') setFocusedUri(item.uri);
    }, [openedIds]);

    const renderStreamItem = useCallback(({ item }: { item: RemoteStreamItem }) => {
        if (item.type === 'media') {
            return (
                <InlineMediaCard
                    item={item}
                    opened={openedIds.has(item.id)}
                    onOpen={() => openMedia(item)}
                    videoPlaybackControl={videoPlaybackControl}
                />
            );
        }
        const isLive = item.id.startsWith('live-text:');
        return (
            <View style={[styles.textBlock, isLive && styles.liveTextBlock]}>
                <View style={styles.textMetaRow}>
                    <Text style={styles.textMeta}>{isLive ? 'LIVE TRANSCRIPT' : 'TRANSIENT BLOCK'}</Text>
                    {isLive && isPartnerTyping && <View style={styles.livePulse} />}
                </View>
                {isLive && remoteSandActive
                    ? <SandText text={item.text} trigger />
                    : <Text style={styles.streamText}>{item.text}</Text>}
                {!isLive && item.expiresAt && (
                    <Text style={styles.expiryMark}>VANISH SCHEDULED</Text>
                )}
            </View>
        );
    }, [isPartnerTyping, openMedia, openedIds, remoteSandActive, videoPlaybackControl]);

    const whisperReady = whisperState === 'live' || whisperState === 'speaking';
    const whisperBusy = whisperState === 'invited' || whisperState === 'connecting';
    const whisperLabel = whisperState === 'speaking' ? 'TRANSMITTING'
        : whisperState === 'live' ? 'WHISPER READY'
        : whisperState === 'connecting' ? 'OPENING WHISPER'
        : whisperState === 'invited' ? 'WHISPER INVITED'
        : whisperState === 'error' ? 'WHISPER RETRY'
        : 'LIVE TEXT';

    return (
        <View style={styles.root}>
            <ArchiveTexture />
            <View style={[styles.readableColumn, { width: readableWidth }]}>
                <FlatList
                    ref={listRef}
                    data={streamData}
                    renderItem={renderStreamItem}
                    keyExtractor={(item) => item.id}
                    style={styles.stream}
                    contentContainerStyle={[
                        styles.streamContent,
                        { paddingBottom: composerHeight + 30 },
                        streamData.length === 0 && styles.emptyContent,
                    ]}
                    ListEmptyComponent={(
                        <View style={styles.emptySignal}>
                            <Text style={styles.archiveIndex}>CASE {roomId}</Text>
                            <View style={styles.emptyGlyph}><View style={styles.emptyGlyphDot} /></View>
                            <Text style={styles.emptyTitle}>SIGNAL WAITING</Text>
                            <Text style={styles.emptySub}>Nothing is being retained here.</Text>
                        </View>
                    )}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onScroll={(event) => {
                        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                        const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
                        const atBottom = distance < 72;
                        setNearBottom(atBottom);
                        if (atBottom) setShowLiveJump(false);
                    }}
                    scrollEventThrottle={80}
                    onContentSizeChange={() => {
                        if (nearBottom) listRef.current?.scrollToEnd({ animated: false });
                    }}
                />

                {showLiveJump && (
                    <TouchableOpacity
                        style={[styles.liveJump, { bottom: composerHeight + 40 }]}
                        onPress={() => {
                            setNearBottom(true);
                            setShowLiveJump(false);
                            listRef.current?.scrollToEnd({ animated: true });
                        }}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.liveJumpText}>LIVE</Text>
                        <Ionicons name="arrow-down" size={14} color="#000" />
                    </TouchableOpacity>
                )}

                <View
                    style={[styles.composer, { maxHeight: composerMaxHeight, bottom: composerBottom }]}
                    onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height + composerBottom)}
                >
                    {attachments.length > 0 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.attachmentRail}
                            keyboardShouldPersistTaps="handled"
                        >
                            {attachments.map((item) => (
                                <View key={item.id} style={[styles.attachmentCard, item.status === 'shown' && styles.attachmentShown]}>
                                    <View style={styles.attachmentPreview}>
                                        {item.kind === 'image'
                                            ? <Image source={{ uri: item.localUri }} style={styles.attachmentImage} resizeMode="cover" />
                                            : (
                                                <View style={styles.attachmentIconPreview}>
                                                    <Ionicons name={item.kind === 'video' ? 'videocam-outline' : 'document-text-outline'} size={24} color={THEME.ink} />
                                                </View>
                                            )}
                                        {item.kind === 'video' && (
                                            item.status === 'shown' ? (
                                                <TouchableOpacity
                                                    style={[styles.attachmentPlay, styles.attachmentPlayShown]}
                                                    onPress={() => toggleVideoPlayback(item)}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={playingAttachmentIds.has(item.id) ? 'Pause shown video for your correspondent' : 'Play shown video for your correspondent'}
                                                >
                                                    <Ionicons
                                                        name={playingAttachmentIds.has(item.id) ? 'pause' : 'play'}
                                                        size={15}
                                                        color="#000"
                                                        style={playingAttachmentIds.has(item.id) ? undefined : { marginLeft: 2 }}
                                                    />
                                                </TouchableOpacity>
                                            ) : (
                                                <View style={styles.attachmentPlay}>
                                                    <Ionicons name="play" size={15} color={THEME.ink} style={{ marginLeft: 2 }} />
                                                </View>
                                            )
                                        )}
                                        <TouchableOpacity
                                            onPress={() => removeAttachment(item.id)}
                                            style={styles.removeAttachment}
                                            accessibilityLabel="Remove staged object"
                                        >
                                            <Ionicons name="close" size={14} color="#000" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.attachmentType}>{item.kind.toUpperCase()}</Text>
                                    {item.status === 'uploading' ? (
                                        <View style={styles.attachmentAction}><ActivityIndicator size="small" color={THEME.ink} /></View>
                                    ) : item.status === 'shown' ? (
                                        <TouchableOpacity style={styles.coverButton} onPress={() => coverAttachment(item.id)}>
                                            <Text style={styles.coverButtonText}>COVER</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={styles.showButton} onPress={() => showAttachment(item.id)}>
                                            <Text style={styles.showButtonText}>{item.status === 'failed' ? 'RETRY' : 'SHOW'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    <View style={styles.inputRow}>
                        <TouchableOpacity
                            style={[styles.plusButton, actionsVisible && styles.plusButtonActive]}
                            onPress={() => setActionsVisible(true)}
                            activeOpacity={0.75}
                            accessibilityLabel="Open object and live actions"
                        >
                            <Ionicons name="add" size={27} color={actionsVisible ? '#000' : THEME.ink} />
                        </TouchableOpacity>
                        <View style={styles.inputWrap}>
                            <TextInput
                                multiline
                                value={localText}
                                onChangeText={(text) => { if (text.length <= textLimit) onChangeText(text); }}
                                placeholder="Speak into the signal…"
                                placeholderTextColor={THEME.faint}
                                style={styles.input}
                                scrollEnabled
                                textAlignVertical="top"
                                accessibilityLabel="Live text. Changes appear to your correspondent immediately."
                            />
                            {localDecayText && (
                                <View style={styles.localSandOverlay} pointerEvents="none">
                                    <SandText text={localDecayText} trigger={localSandActive} onComplete={onLocalSandComplete} />
                                </View>
                            )}
                        </View>
                        <Pressable
                            onPress={onWhisperTap}
                            onPressIn={() => { if (whisperReady) onWhisperHoldChange(true); }}
                            onPressOut={() => { if (whisperReady) onWhisperHoldChange(false); }}
                            style={({ pressed }) => [
                                styles.micButton,
                                whisperBusy && styles.micButtonBusy,
                                whisperReady && styles.micButtonReady,
                                whisperState === 'speaking' && styles.micButtonSpeaking,
                                pressed && whisperReady && styles.micButtonPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={whisperReady ? 'Hold to whisper' : 'Invite correspondent to whisper'}
                            accessibilityHint={whisperReady ? 'Keep holding while you speak, then release.' : 'Your correspondent must accept before audio opens.'}
                        >
                            <Ionicons
                                name={whisperState === 'speaking' ? 'mic' : 'mic-outline'}
                                size={21}
                                color={whisperReady ? '#08110b' : THEME.ink}
                            />
                            {(whisperBusy || whisperReady || whisperState === 'error') && (
                                <View style={[
                                    styles.micStatusDot,
                                    whisperReady ? styles.micStatusReady : styles.micStatusWaiting,
                                ]} />
                            )}
                        </Pressable>
                    </View>
                    <View style={styles.composerFooter}>
                        <TouchableOpacity onPress={onCycleVanish} style={[styles.footerControl, styles.vanishControl]}>
                            <Ionicons name="hourglass-outline" size={14} color={vanishDuration ? THEME.ink : THEME.faint} />
                            <Text style={[styles.footerControlText, vanishDuration > 0 && { color: THEME.ink }]}>
                                {vanishDuration ? `${vanishDuration / 1000}s VANISH` : 'VANISH OFF'}
                            </Text>
                        </TouchableOpacity>
                        <View style={styles.composerStatus} pointerEvents="none">
                            <View style={[
                                styles.composerStatusDot,
                                localText.length > 0 && styles.composerStatusDotActive,
                                whisperBusy && styles.composerStatusDotWaiting,
                                whisperReady && styles.composerStatusDotReady,
                            ]} />
                            <Text style={styles.composerStatusText} numberOfLines={1}>{whisperLabel}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => Alert.alert(
                                'Clear transient text?',
                                'This removes all text blocks for both participants. Shown objects remain under Show/Cover control.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Clear', style: 'destructive', onPress: onClearStream },
                                ],
                            )}
                            style={styles.clearControl}
                            accessibilityLabel="Clear transient text"
                        >
                            <Ionicons name="close-circle-outline" size={17} color={THEME.faint} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <Modal visible={actionsVisible} transparent animationType="fade" onRequestClose={() => setActionsVisible(false)}>
                <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setActionsVisible(false)}>
                    <View style={[styles.actionSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetKicker}>SIGNAL TOOLS</Text>
                        <Text style={styles.sheetSection}>OBJECT · STAGED LOCALLY</Text>
                        <View style={styles.actionGrid}>
                            <ActionButton icon="camera-outline" label="CAMERA" onPress={() => pickMedia('camera')} />
                            <ActionButton icon="images-outline" label="PHOTOS / VIDEO" onPress={() => pickMedia('library')} />
                            <ActionButton icon="document-text-outline" label="PDF" onPress={pickDocument} />
                        </View>
                        <Text style={styles.sheetSection}>LIVE VIEW · REQUIRES CONSENT</Text>
                        <View style={styles.actionGrid}>
                            <ActionButton icon="radio-outline" label="GLASS / MIRROR" onPress={() => { setActionsVisible(false); onOpenLive(); }} />
                        </View>
                        <Text style={styles.sheetFootnote}>Selecting an object does not upload or expose it. SHOW begins transmission.</Text>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={Boolean(focusedUri)} animationType="fade" onRequestClose={() => setFocusedUri(null)}>
                <View style={styles.focusModal}>
                    <View style={[styles.focusHeader, { paddingTop: insets.top + 10 }]}>
                        <Text style={styles.focusLabel}>TEMPORARY VIEW</Text>
                        <TouchableOpacity onPress={() => setFocusedUri(null)} style={styles.focusClose}>
                            <Ionicons name="close" size={22} color={THEME.ink} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.focusBody}>
                        {focusedUri && kindFromUri(focusedUri) === 'pdf' ? (
                            <DocumentViewer uri={resolveUri(focusedUri)} />
                        ) : focusedUri && kindFromUri(focusedUri) === 'video' ? (
                            <Video
                                source={{ uri: resolveUri(focusedUri) }}
                                style={styles.focusMedia}
                                resizeMode={ResizeMode.CONTAIN}
                                useNativeControls
                                shouldPlay={false}
                            />
                        ) : focusedUri ? (
                            <Image source={{ uri: resolveUri(focusedUri) }} style={styles.focusMedia} resizeMode="contain" />
                        ) : null}
                        <Watermark />
                    </View>
                    {focusedUri && kindFromUri(focusedUri) === 'pdf' && onSign && (
                        <TouchableOpacity style={styles.signButton} onPress={() => setSignatureVisible(true)}>
                            <Ionicons name="create-outline" size={18} color="#000" />
                            <Text style={styles.signButtonText}>SIGN & RETURN</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>

            <SignatureModal
                visible={signatureVisible}
                onDismiss={() => setSignatureVisible(false)}
                onSign={(line) => onSign?.(line)}
            />
        </View>
    );
}

function ActionButton({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={styles.actionButton} activeOpacity={0.75}>
            <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={THEME.ink} /></View>
            <Text style={styles.actionLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, position: 'relative', overflow: 'hidden' },
    readableColumn: { flex: 1, alignSelf: 'center' },
    archiveRule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#fff', opacity: 0.025 },
    registrationMarkTop: { position: 'absolute', top: 12, left: 12, width: 13, height: 13, borderTopWidth: 1, borderLeftWidth: 1, borderColor: THEME.edge2 },
    registrationMarkBottom: { position: 'absolute', right: 12, bottom: 12, width: 13, height: 13, borderRightWidth: 1, borderBottomWidth: 1, borderColor: THEME.edge2 },
    stream: { flex: 1 },
    streamContent: { paddingHorizontal: 16, paddingTop: 18, gap: 18 },
    emptyContent: { flexGrow: 1, justifyContent: 'center' },
    emptySignal: { alignItems: 'center', paddingHorizontal: 36, opacity: 0.88 },
    archiveIndex: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 9, letterSpacing: 2.2, marginBottom: 20 },
    emptyGlyph: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    emptyGlyphDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: THEME.muted },
    emptyTitle: { fontFamily: THEME.mono, color: THEME.ink, fontSize: 12, letterSpacing: 3, fontWeight: '800', marginTop: 18 },
    emptySub: { color: THEME.faint, fontSize: 13, marginTop: 9 },
    textBlock: { paddingHorizontal: 6, paddingVertical: 4 },
    liveTextBlock: { borderLeftWidth: 1, borderLeftColor: THEME.edge, paddingLeft: 14 },
    textMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    textMeta: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 8, letterSpacing: 1.9 },
    livePulse: { width: 5, height: 5, borderRadius: 3, backgroundColor: THEME.ink },
    streamText: { color: THEME.ink, fontSize: 18, lineHeight: 28, letterSpacing: 0.1 },
    expiryMark: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 7, letterSpacing: 1.6, marginTop: 9 },
    sealedCard: { minHeight: 82, borderWidth: 1, borderColor: THEME.edge, borderRadius: 8, padding: 12, backgroundColor: 'rgba(15,17,20,0.84)', flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
    sealedStamp: { position: 'absolute', top: 5, right: 8, opacity: 0.55 },
    sealedStampText: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 6, letterSpacing: 1.5 },
    sealedIconWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    sealedCopy: { flex: 1 },
    sealedTitle: { fontFamily: THEME.mono, color: THEME.ink, fontSize: 10, letterSpacing: 1.8, fontWeight: '800' },
    sealedSub: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 8, letterSpacing: 1.2, marginTop: 7 },
    openMediaCard: { minHeight: 190, maxHeight: 420, aspectRatio: 4 / 3, borderWidth: 1, borderColor: THEME.edge, borderRadius: 10, backgroundColor: '#030405', overflow: 'hidden' },
    inlineImage: { width: '100%', height: '100%' },
    inlineVideo: { width: '100%', height: '100%' },
    videoBuffering: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', zIndex: 8 },
    openMediaLabel: { position: 'absolute', left: 9, bottom: 9, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 9 },
    openMediaLabelText: { fontFamily: THEME.mono, color: THEME.ink, fontSize: 7, letterSpacing: 1.4 },
    documentCard: { minHeight: 92, borderWidth: 1, borderColor: THEME.edge, borderRadius: 8, backgroundColor: THEME.paper, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
    watermark: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'space-around', transform: [{ rotate: '-26deg' }], zIndex: 5 },
    watermarkText: { fontFamily: THEME.mono, color: 'rgba(255,255,255,0.045)', fontSize: 14, letterSpacing: 5, fontWeight: '900' },
    liveJump: { position: 'absolute', alignSelf: 'center', backgroundColor: THEME.ink, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, flexDirection: 'row', gap: 7, alignItems: 'center', zIndex: 14 },
    liveJumpText: { fontFamily: THEME.mono, color: '#000', fontSize: 8, letterSpacing: 1.6, fontWeight: '900' },
    composer: { position: 'absolute', left: 10, right: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(245,243,235,0.24)', backgroundColor: 'rgba(15,17,20,0.98)', overflow: 'hidden', zIndex: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 16 },
    attachmentRail: { paddingHorizontal: 11, paddingTop: 11, paddingBottom: 5, gap: 9 },
    attachmentCard: { width: 104, borderRadius: 10, borderWidth: 1, borderColor: THEME.edge2, backgroundColor: THEME.paper2, overflow: 'hidden', paddingBottom: 8 },
    attachmentShown: { borderColor: 'rgba(245,243,235,0.5)' },
    attachmentPreview: { height: 70, backgroundColor: '#08090b', position: 'relative' },
    attachmentImage: { width: '100%', height: '100%' },
    attachmentIconPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    attachmentPlay: { position: 'absolute', alignSelf: 'center', top: 21, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.72)', borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    attachmentPlayShown: { backgroundColor: THEME.ink, borderColor: THEME.ink },
    removeAttachment: { position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(245,243,235,0.9)', alignItems: 'center', justifyContent: 'center' },
    attachmentType: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 7, letterSpacing: 1.4, paddingHorizontal: 8, marginTop: 7 },
    attachmentAction: { height: 25, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
    showButton: { marginHorizontal: 7, marginTop: 5, minHeight: 25, borderRadius: 5, backgroundColor: THEME.ink, justifyContent: 'center', alignItems: 'center' },
    showButtonText: { fontFamily: THEME.mono, color: '#000', fontSize: 7, letterSpacing: 1.4, fontWeight: '900' },
    coverButton: { marginHorizontal: 7, marginTop: 5, minHeight: 25, borderRadius: 5, borderWidth: 1, borderColor: THEME.edge, justifyContent: 'center', alignItems: 'center' },
    coverButtonText: { fontFamily: THEME.mono, color: THEME.ink, fontSize: 7, letterSpacing: 1.4, fontWeight: '900' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8, gap: 8 },
    plusButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    plusButtonActive: { backgroundColor: THEME.ink },
    inputWrap: { flex: 1, minHeight: 40, position: 'relative', justifyContent: 'flex-end' },
    input: { minHeight: 40, maxHeight: 126, color: THEME.ink, fontSize: 16, lineHeight: 22, paddingHorizontal: 5, paddingTop: 9, paddingBottom: 8 },
    localSandOverlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 5, paddingTop: 9, paddingBottom: 8, backgroundColor: THEME.paper },
    micButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: THEME.edge, backgroundColor: 'rgba(255,255,255,0.025)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
    micButtonBusy: { borderColor: 'rgba(239,68,68,0.7)' },
    micButtonReady: { backgroundColor: '#77D68C', borderColor: '#77D68C' },
    micButtonSpeaking: { backgroundColor: '#9AEAAA', transform: [{ scale: 1.04 }] },
    micButtonPressed: { opacity: 0.88 },
    micStatusDot: { position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#111316' },
    micStatusWaiting: { backgroundColor: '#EF4444' },
    micStatusReady: { backgroundColor: '#1E7A38' },
    composerFooter: { minHeight: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 8, borderTopWidth: 1, borderTopColor: THEME.edge2 },
    footerControl: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 12 },
    vanishControl: { flexShrink: 0 },
    footerControlText: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 7, letterSpacing: 1.2 },
    composerStatus: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    composerStatusDot: { width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: THEME.faint },
    composerStatusDotActive: { backgroundColor: THEME.ink, borderColor: THEME.ink },
    composerStatusDotWaiting: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
    composerStatusDotReady: { backgroundColor: '#77D68C', borderColor: '#77D68C' },
    composerStatusText: { flexShrink: 1, fontFamily: THEME.mono, color: THEME.faint, fontSize: 6.5, letterSpacing: 1, textAlign: 'center' },
    clearControl: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
    actionSheet: { backgroundColor: '#111316', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: THEME.edge, paddingHorizontal: 18, paddingTop: 10 },
    sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: THEME.edge, alignSelf: 'center', marginBottom: 17 },
    sheetKicker: { fontFamily: THEME.mono, color: THEME.ink, fontSize: 11, letterSpacing: 2.6, fontWeight: '900' },
    sheetSection: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 7, letterSpacing: 1.5, marginTop: 20, marginBottom: 10 },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionButton: { width: '30%', minWidth: 96, minHeight: 88, borderRadius: 10, borderWidth: 1, borderColor: THEME.edge2, backgroundColor: 'rgba(255,255,255,0.025)', padding: 10, justifyContent: 'space-between' },
    actionIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontFamily: THEME.mono, color: THEME.muted, fontSize: 7, letterSpacing: 1.2, lineHeight: 11 },
    sheetFootnote: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 7, lineHeight: 12, letterSpacing: 1, marginTop: 18 },
    focusModal: { flex: 1, backgroundColor: '#030405' },
    focusHeader: { minHeight: 64, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: THEME.edge2 },
    focusLabel: { fontFamily: THEME.mono, color: THEME.faint, fontSize: 8, letterSpacing: 2 },
    focusClose: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', justifyContent: 'center' },
    focusBody: { flex: 1, position: 'relative' },
    focusMedia: { width: '100%', height: '100%' },
    signButton: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: THEME.ink, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18 },
    signButtonText: { fontFamily: THEME.mono, color: '#000', fontSize: 8, letterSpacing: 1.8, fontWeight: '900' },
});
