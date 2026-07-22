import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    Platform, Alert, Modal, StyleSheet, Share,
    Animated as RNAnimated, Keyboard, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRoomContext } from '../../contexts/RoomContext';
import { useRoom, LinkStatus } from '../../hooks/useRoom';
import RoomTabBar from '../../components/RoomTabBar';
import SignalStream from '../../components/SignalStream';
import SettingsPanel from '../../components/SettingsPanel';
import WhisperPanel, { type WhisperState } from '../../components/WhisperPanel';
import InviteOverlay from '../../components/InviteOverlay';
import ListeningIndicator from '../../components/ListeningIndicator';
import LiveGlassPanel from '../../components/LiveGlassPanel';
import ScreenSharePanel from '../../components/ScreenSharePanel';
import LiveLauncher from '../../components/LiveLauncher';
import HandshakeScreen, {
    hasAckedHandshake,
    ackHandshake,
    unackHandshake,
} from '../../components/HandshakeScreen';
import { usePartnerHandshake } from '../../hooks/usePartnerHandshake';
import GridBackground from '../../components/GridBackground';
import PresencePulse from '../../components/PresencePulse';
import { usePresence } from '../../hooks/usePresence';
import * as ScreenCapture from 'expo-screen-capture';
import { THEME } from '../../constants/Theme';
import { useWalkthroughTarget } from '../../lib/walkthrough/WalkthroughContext';
// ─── Typing Indicator ───
function TypingIndicator({ isTyping }: { isTyping: boolean }) {
    const dotAnim = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (isTyping) {
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                    RNAnimated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            dotAnim.stopAnimation();
            dotAnim.setValue(0);
        }
    }, [isTyping]);

    if (!isTyping) return null;

    return (
        <RNAnimated.Text style={[st.typingText, { opacity: dotAnim }]}>
            typing...
        </RNAnimated.Text>
    );
}


// ═══════════════════════════════════════════
//  Active Room Content (per-room isolated)
// ═══════════════════════════════════════════
import * as Crypto from 'expo-crypto';
import { useLinkedPartners } from '../../hooks/useLinkedPartners';

function RoomContent({ roomId, onOpenSettings, onOpenLiveGlass, onOpenScreenShare, setLiveGlassPartnerAccepted, setLiveGlassInitialMode }: {
    roomId: string;
    onOpenSettings: () => void;
    onOpenLiveGlass: () => void;
    onOpenScreenShare: (asSharer: boolean) => void;
    setLiveGlassPartnerAccepted: (v: boolean) => void;
    setLiveGlassInitialMode: (m: 'lobby' | 'calling') => void;
}) {
    const { socket, deviceId, limits, removeRoom, rooms } = useRoomContext();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Whether this room came from a deep-link (keyboard MINT or a tapped
    // share-link). Drives whether the handshake/waiting screen renders
    // as the first frame. Manual landing-screen Generate flows have
    // origin='manual' and skip the handshake entirely — they open
    // straight into the chat UI as before.
    const currentRoom = rooms.find(r => r.roomId === roomId);
    const isDeepLinkRoom = currentRoom?.origin === 'deeplink';
    const { partnerPresence, sendPulseTap } = usePresence(socket, roomId);
    const {
        linkStatus, remoteText, remoteTextRevision, remoteStream,
        sendText, sendVanish, sendReveal,
        pendingInvite, inviteStatus, inviteFeature,
        sendInvite, acceptInvite, declineInvite, clearInviteStatus,
        lastBlock, clearBlock,
    } = useRoom(roomId, socket, deviceId);

    // Listens for `partner_handshake` and derives the mutual fingerprint
    // (Receiver Flow 4 — server-trust check). The fingerprint is non-null
    // only once both sides are in the room.
    const { fingerprint } = usePartnerHandshake(roomId, socket, deviceId);

    const { addPartner } = useLinkedPartners();

    // statusPill ref kept for compat with the WalkthroughContext
    // registration (other components — Dock — still use the same
    // pattern). We DO NOT auto-fire the walkthrough on room entry
    // anymore; the FeatureGuide card in Settings replaces that
    // pattern (less intrusive, always available, self-paced).
    const statusPillRef = useWalkthroughTarget<View>('statusPill');

    const [localText, setLocalText] = useState('');
    const [whisperActive, setWhisperActive] = useState(false);
    const [whisperRequestToken, setWhisperRequestToken] = useState(0);
    const [whisperHolding, setWhisperHolding] = useState(false);
    const [whisperConnectionState, setWhisperConnectionState] = useState<WhisperState>('IDLE');
    const [whisperError, setWhisperError] = useState<string | null>(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [whisperBadge, setWhisperBadge] = useState(0);
    const [roomCodeCopied, setRoomCodeCopied] = useState(false);
    const [vanishDuration, setVanishDuration] = useState(0);
    const [incomingWhisper, setIncomingWhisper] = useState(false);
    const [whisperPartnerAccepted, setWhisperPartnerAccepted] = useState(false);
    const [whisperInitialState, setWhisperInitialState] = useState<'idle' | 'accepted'>('idle');
    const [screenshotAlert, setScreenshotAlert] = useState(false);
    const [videoPlaybackControl, setVideoPlaybackControl] = useState<any>(null);
    const [ghostSyncSent, setGhostSyncSent] = useState(false);
    const [liveLauncherOpen, setLiveLauncherOpen] = useState(false);
    // Handshake screen visibility — shown the first time a room reaches
    // LINKED state, per-room ack persisted to AsyncStorage so we never
    // re-show for an already-acknowledged room.
    const [handshakeVisible, setHandshakeVisible] = useState(false);
    const [handshakeAckLoaded, setHandshakeAckLoaded] = useState(false);

    // Load handshake ack state once per room mount.
    useEffect(() => {
        let active = true;
        (async () => {
            const acked = await hasAckedHandshake(roomId);
            if (active) {
                setHandshakeVisible(!acked);
                setHandshakeAckLoaded(true);
            }
        })();
        return () => { active = false; };
    }, [roomId]);

    // ── Sand dissipation vanish (replaces segment-based untyping) ──
    const [sandOverlayText, setSandOverlayText] = useState<string | null>(null);
    const [sandOverlayActive, setSandOverlayActive] = useState(false);
    const [remoteDecayText, setRemoteDecayText] = useState<string | null>(null);
    const [remoteSandActive, setRemoteSandActive] = useState(false);
    const vanishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const localTextRef = useRef(localText);

    // Keep ref in sync so vanish timer always reads current text
    useEffect(() => { localTextRef.current = localText; }, [localText]);

    // ── WhatsApp-style compose: partner feed fills the top, the input
    //    grows line-by-line and docks above the keyboard. We only track
    //    keyboard visibility (to hide the Dock while typing) and the
    //    input's content height (to auto-grow it, clamped). ──
    // Manual keyboard inset. Expo's edge-to-edge mode means the window does
    // NOT auto-resize for the IME even with adjustResize, so we measure the
    // keyboard height and lift the feed+compose by it ourselves (works on
    // both platforms, OTA-safe).
    const [kbHeight, setKbHeight] = useState(0);
    const keyboardVisible = kbHeight > 0;
    const KB_GAP = 8; // visible margin above the keys (insets.bottom corrects
    // the edge-to-edge nav-bar under-lift; this is the actual breathing room)

    useEffect(() => {
        // Track the keyboard frame on show AND on change (switching to
        // emoji/another keyboard resizes it) so the compose bar follows it.
        const onFrame = (e: any) => setKbHeight(e?.endCoordinates?.height ?? 0);
        const showSub = Keyboard.addListener('keyboardDidShow', onFrame);
        const changeSub = Keyboard.addListener('keyboardDidChangeFrame', onFrame);
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
        return () => { showSub.remove(); changeSub.remove(); hideSub.remove(); };
    }, []);

    // ── Typing indicator ──
    const prevRemoteRef = useRef(remoteText);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (remoteText !== prevRemoteRef.current) {
            setIsPartnerTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setIsPartnerTyping(false), 1500);
            prevRemoteRef.current = remoteText;
        }
    }, [remoteText]);

    // ── Keystroke batching (50ms) ──
    const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTextRef = useRef('');
    const batchSendText = useCallback((text: string) => {
        pendingTextRef.current = text;
        if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(() => {
                sendText(pendingTextRef.current);
                batchTimerRef.current = null;
            }, 50);
        }
    }, [sendText]);

    // ── Vanish: remote sand dissipation ──
    useEffect(() => {
        if (!socket || !roomId) return;
        const handleVanish = (data: { roomId: string } | undefined) => {
            if (!data || (typeof data === 'object' && data.roomId === roomId)) {
                if (remoteText) {
                    setRemoteDecayText(remoteText);
                    setRemoteSandActive(true);
                }
            }
        };
        socket.on('remote_vanish', handleVanish);
        return () => { socket.off('remote_vanish', handleVanish); };
    }, [socket, roomId, remoteText]);

    // ── Vanish cycle: Off → 5s → 10s → 15s → 20s → 25s → 30s → Off ──
    const VANISH_CYCLE = [0, 5000, 10000, 15000, 20000, 25000, 30000];
    const handleCycleVanish = () => {
        const idx = VANISH_CYCLE.indexOf(vanishDuration);
        const next = VANISH_CYCLE[(idx + 1) % VANISH_CYCLE.length];
        setVanishDuration(next);
    };

    // ── Vanish trigger: snapshot text → sand dissipation → clear input ──
    // Reads from localTextRef (not state) so setTimeout closures always get current text
    const handleVanishTrigger = useCallback(() => {
        const currentText = localTextRef.current;
        if (!currentText) return;
        // Emit vanish event so partner sees the sand effect
        sendVanish();
        // Snapshot for sand animation overlay
        setSandOverlayText(currentText);
        setSandOverlayActive(true);
        // Clear input in one operation (no char-by-char — no autocomplete interference)
        localTextRef.current = '';
        setLocalText('');
        batchSendText('');
    }, [sendVanish, batchSendText]);

    // ── Handle text input changes — simple, no segment tracking ──
    const handleTextChange = useCallback((newText: string) => {
        if (newText.length > limits.textLimit) return;
        localTextRef.current = newText;
        setLocalText(newText);
        batchSendText(newText);

        // Reset vanish timer on each keystroke
        if (vanishDuration > 0 && newText.length > 0) {
            if (vanishTimerRef.current) clearTimeout(vanishTimerRef.current);
            vanishTimerRef.current = setTimeout(() => {
                handleVanishTrigger();
            }, vanishDuration);
        } else if (vanishTimerRef.current) {
            clearTimeout(vanishTimerRef.current);
            vanishTimerRef.current = null;
        }
    }, [vanishDuration, batchSendText, limits.textLimit, handleVanishTrigger]);

    // Showing an object is an ordered boundary transaction. Flush the latest
    // text revision synchronously (it may still be inside the 50 ms batch),
    // emit Show so the receiver freezes that exact revision, then clear the
    // local composer. The Show event itself retires the receiver's live row;
    // sending a second empty-text revision here could arrive after the first
    // characters of the next block on a recovering connection.
    const handleShowObject = useCallback((payload: string, itemId: string) => {
        if (vanishTimerRef.current) {
            clearTimeout(vanishTimerRef.current);
            vanishTimerRef.current = null;
        }
        if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        const currentText = pendingTextRef.current;
        if (currentText) sendText(currentText);
        sendReveal(payload, 'show', { itemId, textTtlMs: vanishDuration });
        if (!currentText) return;
        pendingTextRef.current = '';
        localTextRef.current = '';
        setLocalText('');
    }, [sendReveal, sendText, vanishDuration]);

    const handleClearStream = useCallback(() => {
        if (vanishTimerRef.current) {
            clearTimeout(vanishTimerRef.current);
            vanishTimerRef.current = null;
        }
        sendVanish('all');
        localTextRef.current = '';
        pendingTextRef.current = '';
        setLocalText('');
        batchSendText('');
    }, [batchSendText, sendVanish]);

    // ── Cleanup vanish timer on unmount ──
    useEffect(() => {
        return () => {
            if (vanishTimerRef.current) clearTimeout(vanishTimerRef.current);
        };
    }, []);

    // ── Whisper PTT indicator (partner speaking via walkie-talkie) ──
    useEffect(() => {
        if (!socket || !roomId) return;
        let expireTimer: ReturnType<typeof setTimeout> | null = null;
        const handlePtt = (data: { roomId: string; speaking: boolean }) => {
            if (data.roomId !== roomId) return;
            if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
            if (data.speaking) {
                setIncomingWhisper(true);
                // Safety net: a PTT burst is short. If no further update
                // arrives (dropped release event, or the partner closed
                // Whisper mid-press), force the "transmission received" pill
                // off after a few seconds so it can never stick.
                expireTimer = setTimeout(() => setIncomingWhisper(false), 5000);
            } else {
                setIncomingWhisper(false);
            }
        };
        socket.on('whisper_ptt', handlePtt);
        return () => {
            socket.off('whisper_ptt', handlePtt);
            if (expireTimer) clearTimeout(expireTimer);
            setIncomingWhisper(false);
        };
    }, [socket, roomId]);

    // ── Screenshot detection → notify partner ──
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const subscription = ScreenCapture.addScreenshotListener(() => {
            socket?.emit('screenshot_taken', { roomId });
        });
        return () => subscription.remove();
    }, [socket, roomId]);

    // ── Screenshot alert from partner ──
    useEffect(() => {
        if (!socket || !roomId) return;
        const handleAlert = (data: { roomId: string }) => {
            if (data.roomId === roomId) {
                setScreenshotAlert(true);
                setTimeout(() => setScreenshotAlert(false), 3000);
            }
        };
        socket.on('screenshot_alert', handleAlert);
        return () => { socket.off('screenshot_alert', handleAlert); };
    }, [socket, roomId]);

    // ── Video playback controls (play/pause/seek from sender) ──
    useEffect(() => {
        if (!socket || !roomId) return;
        const handler = (data: any) => {
            if (data.roomId === roomId) {
                setVideoPlaybackControl(data.control);
            }
        };
        socket.on('remote_video_playback', handler);
        return () => { socket.off('remote_video_playback', handler); };
    }, [socket, roomId]);

    // ── Whisper send invite ──
    const handleWhisperInvite = useCallback(() => {
        sendInvite('whisper');
    }, [sendInvite]);

    const handleWhisperTap = useCallback(() => {
        if (whisperConnectionState === 'LIVE' && !whisperError) return;
        setWhisperInitialState('idle');
        setWhisperPartnerAccepted(false);
        setWhisperHolding(false);
        setWhisperError(null);
        setWhisperActive(true);
        setWhisperRequestToken((token) => token + 1);
    }, [whisperConnectionState, whisperError]);

    const handleWhisperHoldChange = useCallback((holding: boolean) => {
        if (whisperConnectionState !== 'LIVE') return;
        setWhisperHolding(holding);
    }, [whisperConnectionState]);

    const handleVideoPlayback = useCallback((control: { action: 'play' | 'pause' | 'seek'; position?: number; itemId?: string }) => {
        socket?.emit('transmit_video_playback', { roomId, control });
    }, [roomId, socket]);

    const handleWhisperStateChange = useCallback((state: WhisperState, error: string | null) => {
        setWhisperConnectionState(state);
        setWhisperError(error);
        if (state !== 'LIVE') setWhisperHolding(false);
    }, []);

    const whisperComposerState = whisperError ? 'error'
        : whisperConnectionState === 'LIVE' && whisperHolding ? 'speaking'
        : whisperConnectionState === 'LIVE' ? 'live'
        : whisperConnectionState === 'CONNECTING' ? 'connecting'
        : whisperConnectionState === 'INVITED' ? 'invited'
        : 'idle';

    // ── Trust Sync (Linked Devices) ──
    const handleLinkDevices = useCallback(() => {
        Alert.alert('COMING SOON', 'Ghost Sync device linking will be available in a future update.', [{ text: 'OK' }]);
    }, []);

    // ── Share session code ──
    const handleShareCode = async () => {
        try {
            if (Platform.OS === 'web') {
                await navigator.clipboard.writeText(roomId);
                setRoomCodeCopied(true);
                setTimeout(() => setRoomCodeCopied(false), 1500);
            } else {
                await Share.share({ message: `Join my Piqabu session: ${roomId}` });
            }
        } catch {}
    };

    // ── Handle invite acceptance ──
    useEffect(() => {
        if (inviteStatus === 'accepted') {
            if (inviteFeature === 'live_glass') {
                // Panel is already open in 'calling' mode — signal partner accepted
                setLiveGlassPartnerAccepted(true);
            } else if (inviteFeature === 'screen_share') {
                onOpenScreenShare(true); // Your invite was accepted = you're the sharer
            } else if (inviteFeature === 'whisper') {
                setWhisperPartnerAccepted(true);
            } else if (inviteFeature.startsWith('trust_sync_')) {
                const uuid = inviteFeature.replace('trust_sync_', '');
                addPartner('partner', uuid).then(() => {
                    setGhostSyncSent(false);
                    Alert.alert('DEVICES LINKED', 'You can now instantly connect from the Landing screen.', [{text: 'OK'}]);
                });
            }
            clearInviteStatus();
        }
    }, [inviteStatus, inviteFeature, clearInviteStatus, onOpenScreenShare]);

    const isLinked = linkStatus === 'LINKED';
    const partnerConnected = linkStatus === 'LINKED';

    return (
        <View style={st.roomContent}>
            {/* ─── Screenshot Alert Banner ─── */}
            {screenshotAlert && (
                <View style={st.screenshotBanner}>
                    <Ionicons name="warning" size={14} color="#000" />
                    <Text style={st.screenshotBannerText}>PARTNER CAPTURED SCREEN</Text>
                </View>
            )}

            {/* ─── Session Header ─── */}
            <View style={st.header}>
                <View style={st.headerLeft}>
                    <View ref={statusPillRef} collapsable={false} style={st.statusPill}>
                        <Text style={st.statusLabel}>
                            {!isLinked ? 'OFFLINE' : partnerConnected ? 'PARTNER ACTIVE' : 'WAITING...'}
                        </Text>
                        <TypingIndicator isTyping={isPartnerTyping} />
                    </View>
                </View>

                <View style={st.headerRight}>
                    <TouchableOpacity
                        onPress={handleLinkDevices}
                        style={[
                            st.headerIconBtn,
                            ghostSyncSent && { backgroundColor: '#fff', borderWidth: 0 },
                        ]}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons
                            name={ghostSyncSent ? 'ghost' : 'ghost-outline'}
                            size={18}
                            color={ghostSyncSent ? '#000' : THEME.muted}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onOpenSettings} style={st.headerIconBtn} activeOpacity={0.7}>
                        <Ionicons name="settings-outline" size={18} color={THEME.muted} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Signal Stream v2. The old split feed and separate Reveal/Peek
                decks remain in source for rollback, but are not mounted. */}
            <View style={[st.signalContainer, {
                paddingBottom: kbHeight > 0
                    ? kbHeight + (Platform.OS === 'android' ? insets.bottom : 0) + KB_GAP
                    : 0,
            }]}>
                <SignalStream
                    roomId={roomId}
                    remoteText={remoteText}
                    remoteTextRevision={remoteTextRevision}
                    remoteStream={remoteStream}
                    remoteDecayText={remoteDecayText}
                    remoteSandActive={remoteSandActive}
                    localDecayText={sandOverlayText}
                    localSandActive={sandOverlayActive}
                    localText={localText}
                    textLimit={limits.textLimit}
                    vanishDuration={vanishDuration}
                    isPartnerTyping={isPartnerTyping}
                    keyboardVisible={keyboardVisible}
                    onChangeText={handleTextChange}
                    onShow={handleShowObject}
                    onCover={(payload, itemId) => sendReveal(payload, 'cover', { itemId, purge: true })}
                    onClearStream={handleClearStream}
                    onCycleVanish={handleCycleVanish}
                    whisperState={whisperComposerState}
                    onWhisperTap={handleWhisperTap}
                    onWhisperHoldChange={handleWhisperHoldChange}
                    onOpenLive={() => setLiveLauncherOpen(true)}
                    videoPlaybackControl={videoPlaybackControl}
                    onVideoControl={handleVideoPlayback}
                    onSign={(line) => handleTextChange(line)}
                    onLocalSandComplete={() => {
                        setSandOverlayText(null);
                        setSandOverlayActive(false);
                    }}
                />
            </View>

            {/* Listening Indicator */}
            <ListeningIndicator incomingWhisper={incomingWhisper} />

            <WhisperPanel
                visible={whisperActive}
                onClose={() => {
                    setWhisperActive(false);
                    setWhisperHolding(false);
                    setWhisperPartnerAccepted(false);
                    setWhisperInitialState('idle');
                }}
                socket={socket}
                roomId={roomId}
                onSendInvite={handleWhisperInvite}
                partnerAccepted={whisperPartnerAccepted}
                initialState={whisperInitialState}
                whisperBadge={whisperBadge}
                headless
                startRequested={whisperRequestToken}
                holdActive={whisperHolding}
                onStateChange={handleWhisperStateChange}
            />

            {/* Invite Overlay */}
            <InviteOverlay
                visible={pendingInvite !== null}
                feature={
                    pendingInvite?.feature === 'live_glass' ? 'LIVE GLASS'
                    : pendingInvite?.feature === 'screen_share' ? 'LIVE MIRROR'
                    : pendingInvite?.feature?.startsWith('trust_sync_') ? 'DEVICE LINK REQUEST'
                    : 'WHISPER'
                }
                onAccept={() => {
                    if (pendingInvite) {
                        acceptInvite(pendingInvite.feature);
                        if (pendingInvite.feature === 'whisper') {
                            setWhisperInitialState('accepted');
                            setWhisperError(null);
                            setWhisperActive(true);
                        } else if (pendingInvite.feature === 'live_glass') {
                            // Receiver: skip lobby, go straight to calling/WebRTC
                            setLiveGlassInitialMode('calling');
                            setLiveGlassPartnerAccepted(false);
                            onOpenLiveGlass();
                        } else if (pendingInvite.feature === 'screen_share') {
                            onOpenScreenShare(false); // Accepting invite = you're the viewer
                        } else if (pendingInvite.feature.startsWith('trust_sync_')) {
                            const uuid = pendingInvite.feature.replace('trust_sync_', '');
                            addPartner('partner', uuid).then(() => {
                                Alert.alert('DEVICES LINKED', 'You can now instantly connect from the Landing screen.', [{text: 'OK'}]);
                            });
                        }
                    }
                }}
                onDecline={() => {
                    if (pendingInvite) declineInvite(pendingInvite.feature);
                }}
            />

            {/* Piqa Live launcher — single entry point for camera + screen share */}
            <LiveLauncher
                visible={liveLauncherOpen}
                onDismiss={() => setLiveLauncherOpen(false)}
                onSelectGlass={() => {
                    // Free for everyone — no gate on starting Live Glass.
                    setLiveGlassInitialMode('lobby');
                    setLiveGlassPartnerAccepted(false);
                    onOpenLiveGlass();
                }}
                onSelectMirror={() => sendInvite('screen_share')}
            />

            {/* Time-fenced expiry — a stale share-link the server rejected. */}
            {lastBlock?.message === 'TIME_FENCED' && (
                <View style={st.fenceOverlay} pointerEvents="auto">
                    <View style={st.fenceCard}>
                        <Ionicons name="time-outline" size={40} color={THEME.muted} />
                        <Text style={st.fenceTitle}>LINK EXPIRED</Text>
                        <Text style={st.fenceBody}>
                            This share-link has been sitting unused for too long. Ask your correspondent to mint a fresh one.
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                clearBlock();
                                removeRoom(roomId);
                                router.replace('/');
                            }}
                            style={st.fenceBtn}
                            activeOpacity={0.7}
                        >
                            <Text style={st.fenceBtnText}>BACK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Handshake screen — shown ONLY for deep-link rooms (keyboard
                MINT or tapped share-link). Manual generate-from-landing
                rooms skip this and go straight to the chat UI.
                WAITING when only the local user is in the room (sender side
                post-MINT), LINKED once the partner joins. */}
            {isDeepLinkRoom && handshakeAckLoaded && handshakeVisible && (
                <HandshakeScreen
                    visible={true}
                    roomCode={roomId}
                    linked={linkStatus === 'LINKED'}
                    fingerprint={fingerprint}
                    onStartTyping={async () => {
                        await ackHandshake(roomId);
                        setHandshakeVisible(false);
                    }}
                    onDismiss={async () => {
                        await unackHandshake(roomId);
                        setHandshakeVisible(false);
                        removeRoom(roomId);
                        router.replace('/');
                    }}
                />
            )}
        </View>
    );
}

// ═══════════════════════════════════════════
//  Main Room Screen with Tab Support
// ═══════════════════════════════════════════
export default function RoomScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const stableTop = useRef(insets.top).current;
    const {
        rooms, activeRoomId, addRoom, removeRoom, switchRoom,
        socket, deviceId, requestRoomCode, isConnected,
        hydrated,
    } = useRoomContext();

    const [showAddModal, setShowAddModal] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showLiveGlass, setShowLiveGlass] = useState(false);
    const [liveGlassInitialMode, setLiveGlassInitialMode] = useState<'lobby' | 'calling'>('lobby');
    const [liveGlassPartnerAccepted, setLiveGlassPartnerAccepted] = useState(false);
    const [showScreenShare, setShowScreenShare] = useState(false);
    const [isScreenSharer, setIsScreenSharer] = useState(false);
    const [screenShareMinimized, setScreenShareMinimized] = useState(false);

    const [roomStatuses, setRoomStatuses] = useState<Record<string, LinkStatus>>({});

    const screenFade = useRef(new RNAnimated.Value(0)).current;
    useEffect(() => {
        RNAnimated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleLinkStatus = (data: { roomId: string; status: LinkStatus }) => {
            setRoomStatuses(prev => ({ ...prev, [data.roomId]: data.status }));
        };
        socket.on('link_status', handleLinkStatus);
        return () => { socket.off('link_status', handleLinkStatus); };
    }, [socket]);

    // Only redirect to home once storage has fully rehydrated — prevents the
    // ephemeral-state boot loop in the dev build during Fast Refresh / error recovery
    useEffect(() => {
        if (hydrated && rooms.length === 0) router.replace('/');
    }, [hydrated, rooms.length]);

    const tryAddRoom = (code: string): boolean => {
        const result = addRoom(code);
        if (!result.success) {
            setShowAddModal(false);
            Alert.alert('Room limit reached', 'You can keep up to 5 active rooms at once. Close one to add another.');
            return false;
        }
        return true;
    };

    const handleCreateNewRoom = async () => {
        try {
            const code = await requestRoomCode();
            if (tryAddRoom(code)) setShowAddModal(false);
        } catch { Alert.alert('Error', 'Unable to create room.'); }
    };

    const handleJoinNewRoom = () => {
        if (newCode.length !== 6) return;
        if (tryAddRoom(newCode.toUpperCase())) { setNewCode(''); setShowAddModal(false); }
    };

    const handleRegenerateKey = async () => {
        if (!activeRoomId) return;
        removeRoom(activeRoomId);
        try {
            const code = await requestRoomCode();
            addRoom(code);
        } catch {}
        setShowSettings(false);
    };

    const handleLeaveChannel = () => {
        if (activeRoomId) removeRoom(activeRoomId);
        setShowSettings(false);
    };

    if (!activeRoomId) return null;

    return (
        <RNAnimated.View style={[st.screen, { opacity: screenFade, paddingTop: stableTop || 30 }]}>
            <GridBackground />
            <RoomTabBar
                rooms={rooms} activeRoomId={activeRoomId} roomStatuses={roomStatuses}
                onSwitchRoom={switchRoom} onAddRoom={() => setShowAddModal(true)}
                onCloseRoom={(id) => removeRoom(id)}
            />

            <RoomContent
                key={activeRoomId} roomId={activeRoomId}
                onOpenSettings={() => setShowSettings(true)}
                onOpenLiveGlass={() => setShowLiveGlass(true)}
                onOpenScreenShare={(asSharer: boolean) => {
                    setIsScreenSharer(asSharer);
                    setShowScreenShare(true);
                }}
                setLiveGlassPartnerAccepted={setLiveGlassPartnerAccepted}
                setLiveGlassInitialMode={setLiveGlassInitialMode}
            />

            <SettingsPanel
                visible={showSettings} onClose={() => setShowSettings(false)}
                roomId={activeRoomId} linkStatus={roomStatuses[activeRoomId] || 'WAITING'}
                onRegenerateKey={handleRegenerateKey} onLeaveChannel={handleLeaveChannel}
                onLinkDevices={() => {
                    const syncId = `SYNC_${Crypto.randomUUID()}`;
                    socket?.emit('send_invite', { roomId: activeRoomId, feature: `trust_sync_${syncId}` });
                    setShowSettings(false);
                }}
            />

            {/* Live Glass */}
            <LiveGlassPanel
                visible={showLiveGlass}
                onClose={() => {
                    setShowLiveGlass(false);
                    setLiveGlassPartnerAccepted(false);
                }}
                socket={socket}
                roomId={activeRoomId}
                onSendInvite={() => {
                    // RoomContent's sendInvite is scoped to the room — we need socket here
                    socket?.emit('send_invite', { roomId: activeRoomId, feature: 'live_glass' });
                }}
                partnerAccepted={liveGlassPartnerAccepted}
                initialMode={liveGlassInitialMode}
            />

            {/* Screen Share */}
            <ScreenSharePanel
                visible={showScreenShare}
                onClose={() => {
                    setShowScreenShare(false);
                    setScreenShareMinimized(false);
                    setIsScreenSharer(false);
                }}
                socket={socket}
                roomId={activeRoomId}
                isSharer={isScreenSharer}
                minimized={screenShareMinimized}
                onMinimize={() => setScreenShareMinimized(true)}
                onMaximize={() => setScreenShareMinimized(false)}
            />

            {/* Screen share glow border — visible white glow around entire screen */}
            {showScreenShare && isScreenSharer && screenShareMinimized && (
                <View style={[StyleSheet.absoluteFill, st.glowBorderWrap]} pointerEvents="none">
                    <View style={st.glowEdgeTop} />
                    <View style={st.glowEdgeBottom} />
                    <View style={st.glowEdgeLeft} />
                    <View style={st.glowEdgeRight} />
                </View>
            )}

            {/* Add Room Modal */}
            <Modal visible={showAddModal} animationType="fade" transparent>
                <View style={st.addModalBg}>
                    <View style={st.addModalCard}>
                        <View style={st.addModalHeader}>
                            <Text style={st.addModalTitle}>ADD ROOM</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                <Ionicons name="close-outline" size={24} color={THEME.muted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            value={newCode} onChangeText={(v) => setNewCode(v.toUpperCase())}
                            placeholder="ENTER KEY" placeholderTextColor={THEME.faint}
                            style={st.addModalInput}
                            maxLength={6} autoCapitalize="characters" autoCorrect={false}
                        />
                        <TouchableOpacity
                            onPress={handleJoinNewRoom} disabled={newCode.length !== 6}
                            style={[st.addModalJoinBtn, newCode.length !== 6 && { opacity: 0.4 }]}
                            activeOpacity={0.8}
                        >
                            <Text style={st.addModalJoinText}>JOIN</Text>
                        </TouchableOpacity>
                        <View style={st.addModalOr}>
                            <View style={st.addModalOrLine} />
                            <Text style={st.addModalOrText}>OR</Text>
                            <View style={st.addModalOrLine} />
                        </View>
                        <TouchableOpacity onPress={handleCreateNewRoom} style={st.addModalCreateBtn} activeOpacity={0.8}>
                            <Text style={st.addModalCreateText}>GENERATE NEW SESSION</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <StatusBar style="light" />
        </RNAnimated.View>
    );
}

// ═══════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════
const st = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: THEME.bg,
        // paddingTop is now dynamic via useSafeAreaInsets in the component
    },
    roomContent: { flex: 1 },

    // Screenshot alert banner
    screenshotBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: THEME.bad, paddingVertical: 8, paddingHorizontal: 16,
    },
    screenshotBannerText: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900', letterSpacing: 2,
        color: '#000', textTransform: 'uppercase',
    },

    // Header
    header: {
        height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(245,243,235,0.14)',
        marginTop: 8,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    headerRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(245,243,235,0.1)', backgroundColor: 'rgba(0,0,0,0.2)',
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusDotGlow: {
        shadowColor: THEME.live, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 8,
    },
    statusLabel: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 1.8,
        color: THEME.muted, fontWeight: '900', textTransform: 'uppercase',
    },
    headerIconBtn: {
        width: 36, height: 36, borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.2)', backgroundColor: 'transparent',
        alignItems: 'center', justifyContent: 'center',
    },
    vanishLabel: { fontSize: 10, fontWeight: '900', fontFamily: THEME.mono, color: '#000' },

    signalContainer: { flex: 1 },

    // Legacy split interface styles retained for rollback while Signal Stream
    // v2 completes cross-device validation.
    splitContainer: { flex: 1, paddingHorizontal: 14, gap: 12, paddingTop: 12 },
    card: {
        borderRadius: THEME.r, borderWidth: 1, borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)', overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(245,243,235,0.14)',
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    cardDot: { width: 7, height: 7, borderRadius: 99 },
    cardLabel: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 2.8,
        fontWeight: '900', color: THEME.muted, textTransform: 'uppercase',
    },
    cardSub: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 1.4,
        color: THEME.faint, textTransform: 'uppercase',
    },
    cardBody: { flex: 1, position: 'relative', overflow: 'hidden' },
    cardScroll: { flex: 1, padding: 12 },
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 18, zIndex: 2 },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, zIndex: 2 },
    textArea: {
        flex: 1, padding: 12, fontFamily: THEME.mono, fontSize: 13,
        lineHeight: 20, color: THEME.ink, textAlignVertical: 'top', opacity: 0.92,
    },
    // WhatsApp-style growing compose bar (docks above the keyboard).
    composeBar: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        borderRadius: THEME.r,
        borderWidth: 1,
        borderColor: THEME.edge,
        backgroundColor: 'rgba(0,0,0,0.10)',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    composeDot: { marginTop: 17 },
    composeInputWrap: { flex: 1, position: 'relative' },
    composeInput: {
        fontFamily: THEME.mono,
        fontSize: 14,
        lineHeight: 20,
        color: THEME.ink,
        textAlignVertical: 'top',
        paddingVertical: 10,
        paddingHorizontal: 2,
    },
    placeholderText: { fontFamily: THEME.mono, fontSize: 13, color: THEME.faint, textTransform: 'uppercase' },
    decayText: { fontFamily: THEME.mono, fontSize: 13, lineHeight: 20, color: THEME.ink },
    typingText: { fontFamily: THEME.mono, fontSize: 8, color: THEME.live, marginLeft: 8, textTransform: 'uppercase' },

    // Add Room Modal
    addModalBg: { flex: 1, backgroundColor: 'rgba(6,7,9,0.95)', justifyContent: 'center', padding: 24 },
    addModalCard: {
        backgroundColor: THEME.paper, borderRadius: 26,
        borderWidth: 1, borderColor: THEME.edge, padding: 20,
    },
    addModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    addModalTitle: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900', letterSpacing: 2.8,
        color: THEME.muted, textTransform: 'uppercase',
    },
    addModalInput: {
        backgroundColor: 'rgba(0,0,0,0.14)', borderWidth: 1, borderColor: THEME.edge,
        borderRadius: 18, padding: 16, fontFamily: THEME.mono, fontSize: 16, fontWeight: '900',
        letterSpacing: 3.5, color: THEME.ink, textTransform: 'uppercase', textAlign: 'center', marginBottom: 16,
    },
    addModalJoinBtn: {
        padding: 14, borderRadius: 14, borderWidth: 1, borderColor: THEME.edge,
        backgroundColor: 'rgba(245,243,235,0.06)', alignItems: 'center', marginBottom: 12,
    },
    addModalJoinText: {
        fontFamily: THEME.mono, fontSize: 11, fontWeight: '900', letterSpacing: 1.1,
        color: THEME.ink, textTransform: 'uppercase',
    },
    addModalOr: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
    addModalOrLine: { flex: 1, height: 1, backgroundColor: 'rgba(245,243,235,0.12)' },
    addModalOrText: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 2.4, color: THEME.faint, textTransform: 'uppercase',
    },
    addModalCreateBtn: {
        padding: 14, borderRadius: 14, borderWidth: 1, borderColor: THEME.edge, alignItems: 'center', marginTop: 4,
    },
    addModalCreateText: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900', letterSpacing: 2.2,
        color: THEME.ink, textTransform: 'uppercase',
    },

    /* TIME_FENCED expired-link overlay (Receiver Flow 2). */
    fenceOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: THEME.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 90,
    },
    fenceCard: {
        alignItems: 'center',
        maxWidth: 360,
    },
    fenceTitle: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 14,
        letterSpacing: 3,
        fontWeight: '900',
        marginTop: 18,
    },
    fenceBody: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 11,
        lineHeight: 16,
        textAlign: 'center',
        marginTop: 12,
    },
    fenceBtn: {
        marginTop: 28,
        paddingVertical: 12,
        paddingHorizontal: 28,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.edge,
    },
    fenceBtnText: {
        fontFamily: THEME.mono,
        color: THEME.ink,
        fontSize: 10,
        letterSpacing: 2.5,
        fontWeight: '700',
    },

    // Screen share glow wrapper — full border glow visible on Android
    glowBorderWrap: {
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.9)',
        borderRadius: 0,
        zIndex: 9999,
    },
    // Screen share glow edges — uses thick bars with gradient-like opacity for Android visibility
    glowEdgeTop: {
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        backgroundColor: '#fff', zIndex: 9999,
        shadowColor: '#fff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 20,
        elevation: 20,
    },
    glowEdgeBottom: {
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
        backgroundColor: '#fff', zIndex: 9999,
        shadowColor: '#fff', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 1, shadowRadius: 20,
        elevation: 20,
    },
    glowEdgeLeft: {
        position: 'absolute', top: 0, bottom: 0, left: 0, width: 4,
        backgroundColor: '#fff', zIndex: 9999,
        shadowColor: '#fff', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 1, shadowRadius: 20,
        elevation: 20,
    },
    glowEdgeRight: {
        position: 'absolute', top: 0, bottom: 0, right: 0, width: 4,
        backgroundColor: '#fff', zIndex: 9999,
        shadowColor: '#fff', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 1, shadowRadius: 20,
        elevation: 20,
    },
});
