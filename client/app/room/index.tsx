import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
    Platform, ScrollView, Alert, Modal, StyleSheet,
    Animated as RNAnimated, Keyboard, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import { useRoomContext } from '../../contexts/RoomContext';
import { useRoom, LinkStatus } from '../../hooks/useRoom';
import RoomTabBar from '../../components/RoomTabBar';
import Dock from '../../components/Dock';
import RevealDeck from '../../components/RevealDeck';
import PeepDeck from '../../components/PeepDeck';
import SettingsPanel from '../../components/SettingsPanel';
import WhisperPanel from '../../components/WhisperPanel';
import InviteOverlay from '../../components/InviteOverlay';
import ListeningIndicator from '../../components/ListeningIndicator';
import LiveGlassPanel from '../../components/LiveGlassPanel';
import ScreenSharePanel from '../../components/ScreenSharePanel';
import PresencePulse from '../../components/PresencePulse';
import { usePresence } from '../../hooks/usePresence';
import Paywall from '../../components/Paywall';
import { THEME } from '../../constants/Theme';
import type { VoiceFilter } from '../../components/WhisperPanel';

// ─── Vanish Decay Text Renderer ───
function DecayText({ text, isDecaying }: { text: string; isDecaying: boolean }) {
    const [displayChars, setDisplayChars] = useState<string[]>([]);
    const [decayIndex, setDecayIndex] = useState(-1);
    const decayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!isDecaying) {
            setDisplayChars(text.split(''));
            setDecayIndex(-1);
        }
    }, [text, isDecaying]);

    useEffect(() => {
        if (isDecaying && displayChars.length > 0) {
            let idx = displayChars.length - 1;
            setDecayIndex(idx);

            decayIntervalRef.current = setInterval(() => {
                idx--;
                if (idx < 0) {
                    if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
                    setDisplayChars([]);
                    setDecayIndex(-1);
                } else {
                    setDecayIndex(idx);
                }
            }, 30);
        }

        return () => {
            if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
        };
    }, [isDecaying]);

    if (displayChars.length === 0 && !isDecaying) return null;

    return (
        <Text style={st.decayText}>
            {displayChars.map((char, i) => {
                const isPendingDecay = isDecaying && decayIndex >= 0 && i >= decayIndex;
                const isPreFade = isDecaying && decayIndex >= 0 && i >= decayIndex - 8 && i < decayIndex;
                return (
                    <Text
                        key={i}
                        style={{
                            color: isPendingDecay ? 'transparent' : isPreFade ? THEME.faint : THEME.ink,
                            opacity: isPendingDecay ? 0 : isPreFade ? 0.3 : 0.92,
                        }}
                    >
                        {char}
                    </Text>
                );
            })}
        </Text>
    );
}

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
function RoomContent({ roomId, onOpenSettings, onOpenLiveGlass, onOpenScreenShare }: {
    roomId: string;
    onOpenSettings: () => void;
    onOpenLiveGlass: () => void;
    onOpenScreenShare: (asSharer: boolean) => void;
}) {
    const { socket, deviceId, limits } = useRoomContext();
    const { partnerPresence, sendPulseTap } = usePresence(socket, roomId);
    const {
        linkStatus, remoteText, remoteReveal, remoteWhisper,
        sendText, sendVanish, sendReveal,
        pendingInvite, inviteStatus, inviteFeature,
        sendInvite, acceptInvite, declineInvite, clearInviteStatus,
    } = useRoom(roomId, socket, deviceId);

    const [localText, setLocalText] = useState('');
    const [activeOverlay, setActiveOverlay] = useState<'peep' | 'whisper' | 'reveal' | null>(null);
    const [isRemoteDecaying, setIsRemoteDecaying] = useState(false);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [whisperBadge, setWhisperBadge] = useState(0);
    const [roomCodeCopied, setRoomCodeCopied] = useState(false);
    const [vanishDuration, setVanishDuration] = useState(0);
    const [incomingWhisper, setIncomingWhisper] = useState(false);

    // ── Auto-vanish segment tracking (isolated segments prevent typing interference) ──
    type VanishSegment = { id: string; text: string; createdAt: number };
    const [vanishSegments, setVanishSegments] = useState<VanishSegment[]>([]);
    const activeSegIdRef = useRef<string | null>(null);
    const vanishTimerMapRef = useRef<Map<string, { timerId: ReturnType<typeof setTimeout>; intervalId?: ReturnType<typeof setInterval> }>>(new Map());
    const segCounterRef = useRef(0);
    const lastInputTextRef = useRef('');

    // ── Keyboard-aware dynamic split ──
    const remoteFlex = useRef(new RNAnimated.Value(1)).current;
    const localFlex = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => {
            RNAnimated.parallel([
                RNAnimated.timing(remoteFlex, { toValue: 0.6, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
                RNAnimated.timing(localFlex, { toValue: 1.4, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
            ]).start();
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            RNAnimated.parallel([
                RNAnimated.timing(remoteFlex, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
                RNAnimated.timing(localFlex, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
            ]).start();
        });
        return () => { showSub.remove(); hideSub.remove(); };
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

    // ── Vanish: remote decay ──
    useEffect(() => {
        if (!socket || !roomId) return;
        const handleVanish = (data: { roomId: string } | undefined) => {
            if (!data || (typeof data === 'object' && data.roomId === roomId)) {
                setIsRemoteDecaying(true);
                const decayTime = Math.max(remoteText.length * 30, 500) + 300;
                setTimeout(() => setIsRemoteDecaying(false), decayTime);
            }
        };
        socket.on('remote_vanish', handleVanish);
        return () => { socket.off('remote_vanish', handleVanish); };
    }, [socket, roomId, remoteText.length]);

    // ── Vanish cycle: Off → 5s → 10s → 15s → 20s → 25s → 30s → Off ──
    const VANISH_CYCLE = [0, 5000, 10000, 15000, 20000, 25000, 30000];
    const handleCycleVanish = () => {
        const idx = VANISH_CYCLE.indexOf(vanishDuration);
        const next = VANISH_CYCLE[(idx + 1) % VANISH_CYCLE.length];
        setVanishDuration(next);
    };

    // ── Derive localText from segments ──
    const segmentText = vanishSegments.map(s => s.text).join('');

    // ── Sync localText with segment-derived text ──
    useEffect(() => {
        if (localText !== segmentText) {
            setLocalText(segmentText);
            batchSendText(segmentText);
        }
    }, [segmentText]);

    // ── Handle text input changes — diff against segments ──
    const handleTextChange = useCallback((newText: string) => {
        if (newText.length > limits.textLimit) return;
        lastInputTextRef.current = newText;
        const currentJoined = vanishSegments.map(s => s.text).join('');

        if (vanishDuration === 0) {
            // No vanish — just use flat text
            setLocalText(newText);
            batchSendText(newText);
            setVanishSegments([]);
            activeSegIdRef.current = null;
            return;
        }

        if (newText.length > currentJoined.length) {
            // Characters were added — append to active segment or create new one
            const addedChars = newText.slice(currentJoined.length);
            setVanishSegments(prev => {
                const activeId = activeSegIdRef.current;
                const lastSeg = prev.length > 0 ? prev[prev.length - 1] : null;

                if (activeId && lastSeg && lastSeg.id === activeId) {
                    // Extend active segment
                    return prev.map(s =>
                        s.id === activeId ? { ...s, text: s.text + addedChars } : s
                    );
                } else {
                    // Create new segment
                    const id = `seg_${++segCounterRef.current}`;
                    activeSegIdRef.current = id;
                    return [...prev, { id, text: addedChars, createdAt: Date.now() }];
                }
            });
        } else if (newText.length < currentJoined.length) {
            // Characters were deleted (backspace) — remove from end of last non-empty segment
            const charsToRemove = currentJoined.length - newText.length;
            setVanishSegments(prev => {
                const updated = [...prev];
                let remaining = charsToRemove;
                for (let i = updated.length - 1; i >= 0 && remaining > 0; i--) {
                    const seg = updated[i];
                    if (seg.text.length <= remaining) {
                        remaining -= seg.text.length;
                        updated[i] = { ...seg, text: '' };
                    } else {
                        updated[i] = { ...seg, text: seg.text.slice(0, seg.text.length - remaining) };
                        remaining = 0;
                    }
                }
                return updated.filter(s => s.text.length > 0);
            });
        }

        setLocalText(newText);
        batchSendText(newText);
    }, [vanishDuration, vanishSegments, batchSendText, limits.textLimit]);

    // ── Schedule vanish timers for new/growing segments ──
    useEffect(() => {
        if (vanishDuration === 0) {
            // Clear all timers
            vanishTimerMapRef.current.forEach(({ timerId, intervalId }) => {
                clearTimeout(timerId);
                if (intervalId) clearInterval(intervalId);
            });
            vanishTimerMapRef.current.clear();
            return;
        }

        // Check each segment — if it doesn't have a timer yet, schedule one
        vanishSegments.forEach(seg => {
            if (vanishTimerMapRef.current.has(seg.id)) return; // Already scheduled

            const timerId = setTimeout(() => {
                // Start decaying this segment character by character
                const intervalId = setInterval(() => {
                    setVanishSegments(prev => {
                        const target = prev.find(s => s.id === seg.id);
                        if (!target || target.text.length === 0) {
                            // Segment fully decayed — clear interval and remove
                            const timer = vanishTimerMapRef.current.get(seg.id);
                            if (timer?.intervalId) clearInterval(timer.intervalId);
                            vanishTimerMapRef.current.delete(seg.id);
                            return prev.filter(s => s.id !== seg.id);
                        }
                        // Remove last character of THIS segment only
                        return prev.map(s =>
                            s.id === seg.id ? { ...s, text: s.text.slice(0, -1) } : s
                        );
                    });
                }, 30);

                // Store intervalId
                const entry = vanishTimerMapRef.current.get(seg.id);
                if (entry) entry.intervalId = intervalId;
            }, vanishDuration);

            vanishTimerMapRef.current.set(seg.id, { timerId });
        });

        // Clean up timers for segments that no longer exist
        vanishTimerMapRef.current.forEach(({ timerId, intervalId }, id) => {
            if (!vanishSegments.find(s => s.id === id)) {
                clearTimeout(timerId);
                if (intervalId) clearInterval(intervalId);
                vanishTimerMapRef.current.delete(id);
            }
        });
    }, [vanishSegments, vanishDuration]);

    // ── Create new segment on typing pause (300ms idle = new segment) ──
    const segmentPauseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (vanishDuration === 0) return;
        if (segmentPauseRef.current) clearTimeout(segmentPauseRef.current);
        segmentPauseRef.current = setTimeout(() => {
            activeSegIdRef.current = null; // Next keystroke creates new segment
        }, 300);
        return () => {
            if (segmentPauseRef.current) clearTimeout(segmentPauseRef.current);
        };
    }, [localText, vanishDuration]);

    // ── Cleanup vanish timers on unmount or vanishDuration change to 0 ──
    useEffect(() => {
        return () => {
            vanishTimerMapRef.current.forEach(({ timerId, intervalId }) => {
                clearTimeout(timerId);
                if (intervalId) clearInterval(intervalId);
            });
            vanishTimerMapRef.current.clear();
        };
    }, []);

    // ── Whisper playback + badge ──
    useEffect(() => {
        if (remoteWhisper) {
            setWhisperBadge(prev => prev + 1);
            setIncomingWhisper(true);
            import('../../lib/platform/audio').then(({ playAudioFromDataUri }) => {
                playAudioFromDataUri(remoteWhisper, 0.85);
                setTimeout(() => {
                    setWhisperBadge(0);
                    setIncomingWhisper(false);
                }, 5000);
            });
        }
    }, [remoteWhisper]);

    // ── Whisper send ──
    const handleWhisperSend = useCallback((payload: string, _filter: VoiceFilter) => {
        socket?.emit('transmit_whisper', { roomId, payload, filter: _filter });
        setActiveOverlay(null);
    }, [socket, roomId]);

    // ── Room code copy ──
    const handleCopyRoomCode = async () => {
        if (Platform.OS === 'web') {
            try {
                await navigator.clipboard.writeText(roomId);
                setRoomCodeCopied(true);
                setTimeout(() => setRoomCodeCopied(false), 1500);
            } catch {}
        }
    };

    // ── Dock toggle with invite flow ──
    const handleDockToggle = (id: 'peep' | 'whisper' | 'reveal') => {
        if (id === 'whisper' && activeOverlay !== 'whisper') {
            sendInvite('whisper');
            return;
        }
        setActiveOverlay(prev => prev === id ? null : id);
    };

    // ── Handle invite acceptance ──
    useEffect(() => {
        if (inviteStatus === 'accepted') {
            if (inviteFeature === 'whisper') {
                setActiveOverlay('whisper');
            } else if (inviteFeature === 'live_glass') {
                onOpenLiveGlass();
            } else if (inviteFeature === 'screen_share') {
                onOpenScreenShare(true); // Your invite was accepted = you're the sharer
            }
            clearInviteStatus();
        }
    }, [inviteStatus, inviteFeature, clearInviteStatus, onOpenLiveGlass, onOpenScreenShare]);

    const isLinked = linkStatus === 'LINKED';
    const partnerConnected = linkStatus === 'LINKED';

    return (
        <View style={st.roomContent}>
            {/* ─── Session Header ─── */}
            <View style={st.header}>
                <View style={st.headerLeft}>
                    <PresencePulse
                        partnerPresence={partnerPresence}
                        onTap={sendPulseTap}
                        onLongPress={() => {
                            sendPulseTap(); // Sync pulse on long-press
                        }}
                    />
                    <View style={st.statusPill}>
                        <View style={[
                            st.statusDot,
                            { backgroundColor: !isLinked ? THEME.bad : partnerConnected ? THEME.live : THEME.warn },
                            isLinked && partnerConnected && st.statusDotGlow,
                        ]} />
                        <Text style={st.statusLabel}>
                            {!isLinked ? 'OFFLINE' : partnerConnected ? 'PARTNER ACTIVE' : 'WAITING...'}
                        </Text>
                        <TypingIndicator isTyping={isPartnerTyping} />
                    </View>
                </View>

                <View style={st.headerRight}>
                    <TouchableOpacity onPress={() => sendInvite('live_glass')} style={st.headerIconBtn} activeOpacity={0.7}>
                        <Ionicons name="camera-outline" size={18} color={THEME.muted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleCycleVanish}
                        style={[
                            st.headerIconBtn,
                            vanishDuration > 0 && { backgroundColor: THEME.accEmerald, borderWidth: 0 },
                        ]}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="flash" size={16} color={vanishDuration > 0 ? '#000' : THEME.muted} />
                        {vanishDuration > 0 && (
                            <Text style={st.vanishLabel}>{vanishDuration / 1000}s</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleCopyRoomCode} style={st.roomCodePill} activeOpacity={0.7}>
                        <Text style={[st.roomCodeText, roomCodeCopied && { color: THEME.live }]}>
                            {roomCodeCopied ? 'COPIED' : roomId}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onOpenSettings} style={{ padding: 8 }} activeOpacity={0.7}>
                        <Ionicons name="settings-outline" size={20} color={THEME.muted} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ─── Split Text Interface ─── */}
            <View style={st.splitContainer}>
                {/* Remote Card */}
                <RNAnimated.View style={[st.card, { flex: remoteFlex }]}>
                    <View style={st.cardHeader}>
                        <View style={st.cardHeaderLeft}>
                            <View style={[st.cardDot, { backgroundColor: THEME.remote }]} />
                            <Text style={st.cardLabel}>CO-CONSPIRATOR</Text>
                        </View>
                        <Text style={st.cardSub}>REMOTE FEED</Text>
                    </View>
                    <View style={st.cardBody}>
                        <LinearGradient colors={['rgba(15,17,20,0.95)', 'transparent']} style={st.fadeTop} pointerEvents="none" />
                        <ScrollView style={st.cardScroll} showsVerticalScrollIndicator={false}>
                            {remoteText || isRemoteDecaying ? (
                                <DecayText text={remoteText} isDecaying={isRemoteDecaying} />
                            ) : (
                                <Text style={st.placeholderText}>SIGNAL WAITING...</Text>
                            )}
                        </ScrollView>
                        <LinearGradient colors={['transparent', 'rgba(15,17,20,0.95)']} style={st.fadeBottom} pointerEvents="none" />
                    </View>
                </RNAnimated.View>

                {/* Local Card */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                    style={{ flex: 1 }}
                >
                    <RNAnimated.View style={[st.card, { flex: localFlex }]}>
                        <View style={st.cardHeader}>
                            <View style={st.cardHeaderLeft}>
                                <View style={[st.cardDot, { backgroundColor: THEME.local }]} />
                                <Text style={st.cardLabel}>CONSPIRATOR (YOU)</Text>
                            </View>
                            <Text style={st.cardSub}>WRITE • EXPOSE</Text>
                        </View>
                        <View style={st.cardBody}>
                            <LinearGradient colors={['rgba(15,17,20,0.95)', 'transparent']} style={st.fadeTop} pointerEvents="none" />
                            <TextInput
                                multiline
                                value={localText}
                                onChangeText={handleTextChange}
                                placeholder="START TRANSMISSION..."
                                placeholderTextColor={THEME.faint}
                                style={st.textArea}
                            />
                            <LinearGradient colors={['transparent', 'rgba(15,17,20,0.95)']} style={st.fadeBottom} pointerEvents="none" />
                        </View>
                    </RNAnimated.View>
                </KeyboardAvoidingView>
            </View>

            {/* Listening Indicator */}
            <ListeningIndicator incomingWhisper={incomingWhisper} />

            {/* Dock */}
            <Dock
                activeOverlay={activeOverlay}
                onToggle={handleDockToggle}
                incomingWhisper={whisperBadge > 0}
                whisperActive={activeOverlay === 'whisper'}
            />

            {/* Overlays */}
            <RevealDeck
                visible={activeOverlay === 'reveal'}
                onClose={() => setActiveOverlay(null)}
                onReveal={sendReveal}
                onOpenLiveMirror={() => {
                    setActiveOverlay(null);
                    onOpenScreenShare(true); // You initiated = you're the sharer
                }}
            />
            <PeepDeck
                visible={activeOverlay === 'peep'}
                onClose={() => setActiveOverlay(null)}
                remoteImage={remoteReveal}
            />
            <WhisperPanel
                visible={activeOverlay === 'whisper'}
                onClose={() => setActiveOverlay(null)}
                onWhisperSend={handleWhisperSend}
                maxDurationSec={limits.whisperDurationSec}
                whisperBadge={whisperBadge}
            />

            {/* Invite Overlay */}
            <InviteOverlay
                visible={pendingInvite !== null}
                feature={
                    pendingInvite?.feature === 'live_glass' ? 'LIVE GLASS'
                    : pendingInvite?.feature === 'screen_share' ? 'SCREEN SHARE'
                    : 'WHISPER'
                }
                onAccept={() => {
                    if (pendingInvite) {
                        acceptInvite(pendingInvite.feature);
                        if (pendingInvite.feature === 'whisper') {
                            setActiveOverlay('whisper');
                        } else if (pendingInvite.feature === 'live_glass') {
                            onOpenLiveGlass();
                        } else if (pendingInvite.feature === 'screen_share') {
                            onOpenScreenShare(false); // Accepting invite = you're the viewer
                        }
                    }
                }}
                onDecline={() => {
                    if (pendingInvite) declineInvite(pendingInvite.feature);
                }}
            />
        </View>
    );
}

// ═══════════════════════════════════════════
//  Main Room Screen with Tab Support
// ═══════════════════════════════════════════
export default function RoomScreen() {
    const router = useRouter();
    const {
        rooms, activeRoomId, addRoom, removeRoom, switchRoom,
        socket, deviceId, requestRoomCode, isConnected,
        isPro, refreshSubscription,
    } = useRoomContext();

    const [showAddModal, setShowAddModal] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [showPaywall, setShowPaywall] = useState(false);
    const [paywallFeature, setPaywallFeature] = useState('multi_room');
    const [showSettings, setShowSettings] = useState(false);
    const [showLiveGlass, setShowLiveGlass] = useState(false);
    const [showScreenShare, setShowScreenShare] = useState(false);
    const [isScreenSharer, setIsScreenSharer] = useState(false);

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

    useEffect(() => {
        if (rooms.length === 0) router.replace('/');
    }, [rooms.length]);

    const tryAddRoom = (code: string): boolean => {
        const result = addRoom(code);
        if (!result.success) {
            setPaywallFeature('multi_room');
            setShowPaywall(true);
            setShowAddModal(false);
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
        <RNAnimated.View style={[st.screen, { opacity: screenFade }]}>
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
            />

            <SettingsPanel
                visible={showSettings} onClose={() => setShowSettings(false)}
                roomId={activeRoomId} linkStatus={roomStatuses[activeRoomId] || 'WAITING'}
                onRegenerateKey={handleRegenerateKey} onLeaveChannel={handleLeaveChannel}
            />

            {/* Live Glass */}
            <LiveGlassPanel
                visible={showLiveGlass}
                onClose={() => setShowLiveGlass(false)}
                socket={socket}
                roomId={activeRoomId}
            />

            {/* Screen Share */}
            <ScreenSharePanel
                visible={showScreenShare}
                onClose={() => {
                    setShowScreenShare(false);
                    setIsScreenSharer(false);
                }}
                socket={socket}
                roomId={activeRoomId}
                isSharer={isScreenSharer}
            />

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

            <Paywall
                visible={showPaywall} feature={paywallFeature}
                onDismiss={() => setShowPaywall(false)} deviceId={deviceId}
                onSubscribed={async () => { await refreshSubscription(); }}
            />

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
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
    },
    roomContent: { flex: 1 },

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
    roomCodePill: {
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(245,243,235,0.1)',
    },
    roomCodeText: {
        fontFamily: THEME.mono, fontSize: 11, letterSpacing: 1.65, color: THEME.ink, textTransform: 'uppercase',
    },

    // Split Interface
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
    placeholderText: { fontFamily: THEME.mono, fontSize: 13, color: THEME.faint, textTransform: 'uppercase' },
    decayText: { fontFamily: THEME.mono, fontSize: 13, lineHeight: 20 },
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
});
