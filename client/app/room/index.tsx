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
import ListeningIndicator from '../../components/ListeningIndicator';
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

// ─── Zap Flash Overlay ───
function ZapFlash({ active }: { active: boolean }) {
    const opacity = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (active) {
            RNAnimated.sequence([
                RNAnimated.timing(opacity, { toValue: 0.6, duration: 60, useNativeDriver: true }),
                RNAnimated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
            ]).start();
        }
    }, [active]);

    if (!active) return null;

    return (
        <RNAnimated.View
            style={[st.zapFlash, { opacity }]}
            pointerEvents="none"
        />
    );
}

// ═══════════════════════════════════════════
//  Active Room Content (per-room isolated)
// ═══════════════════════════════════════════
function RoomContent({ roomId, onOpenSettings, onOpenLiveGlass }: {
    roomId: string;
    onOpenSettings: () => void;
    onOpenLiveGlass: () => void;
}) {
    const { socket, deviceId, limits } = useRoomContext();
    const {
        linkStatus, remoteText, remoteReveal, remoteWhisper,
        sendText, sendVanish, sendReveal,
    } = useRoom(roomId, socket, deviceId);

    const [localText, setLocalText] = useState('');
    const [activeOverlay, setActiveOverlay] = useState<'peep' | 'whisper' | 'reveal' | null>(null);
    const [isRemoteDecaying, setIsRemoteDecaying] = useState(false);
    const [isLocalDecaying, setIsLocalDecaying] = useState(false);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [whisperBadge, setWhisperBadge] = useState(0);
    const [zapFlash, setZapFlash] = useState(false);
    const [roomCodeCopied, setRoomCodeCopied] = useState(false);
    const [vanishDuration, setVanishDuration] = useState(0);
    const [incomingWhisper, setIncomingWhisper] = useState(false);

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

    // ── Vanish: local trigger with flash ──
    const handleVanish = () => {
        sendVanish();
        setZapFlash(true);
        setTimeout(() => setZapFlash(false), 400);
        setIsLocalDecaying(true);
        const decayTime = Math.max(localText.length * 30, 500) + 300;
        setTimeout(() => {
            setIsLocalDecaying(false);
            setLocalText('');
        }, decayTime);
    };

    // ── Vanish cycle: Off → 5s → 10s → 30s → Off ──
    const VANISH_CYCLE = [0, 5000, 10000, 30000];
    const handleCycleVanish = () => {
        const idx = VANISH_CYCLE.indexOf(vanishDuration);
        const next = VANISH_CYCLE[(idx + 1) % VANISH_CYCLE.length];
        setVanishDuration(next);
    };

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

    // ── Dock toggle ──
    const handleDockToggle = (id: 'peep' | 'whisper' | 'reveal') => {
        setActiveOverlay(prev => prev === id ? null : id);
    };

    const isLinked = linkStatus === 'LINKED';
    const partnerConnected = linkStatus === 'LINKED';

    return (
        <View style={st.roomContent}>
            <ZapFlash active={zapFlash} />

            {/* ─── Session Header ─── */}
            <View style={st.header}>
                <View style={st.headerLeft}>
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
                    <TouchableOpacity onPress={onOpenLiveGlass} style={st.headerIconBtn} activeOpacity={0.7}>
                        <Ionicons name="camera-outline" size={18} color={THEME.muted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={vanishDuration > 0 ? handleCycleVanish : handleVanish}
                        onLongPress={handleCycleVanish}
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
                            {isLocalDecaying ? (
                                <ScrollView style={st.cardScroll}>
                                    <DecayText text={localText} isDecaying={true} />
                                </ScrollView>
                            ) : (
                                <TextInput
                                    multiline
                                    value={localText}
                                    onChangeText={(text) => {
                                        if (text.length > limits.textLimit) return;
                                        setLocalText(text);
                                        batchSendText(text);
                                    }}
                                    placeholder="START TRANSMISSION..."
                                    placeholderTextColor={THEME.faint}
                                    style={st.textArea}
                                />
                            )}
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
                    Alert.alert('Coming Soon', 'Live Mirror screen sharing will be available in a future update.');
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
            />

            <SettingsPanel
                visible={showSettings} onClose={() => setShowSettings(false)}
                roomId={activeRoomId} linkStatus={roomStatuses[activeRoomId] || 'WAITING'}
                onRegenerateKey={handleRegenerateKey} onLeaveChannel={handleLeaveChannel}
            />

            {/* Live Glass Modal */}
            <Modal visible={showLiveGlass} animationType="slide" transparent>
                <View style={st.liveGlassModal}>
                    <View style={st.liveGlassHeader}>
                        <View style={st.liveGlassDot} />
                        <Text style={st.liveGlassTitle}>LIVE GLASS</Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity onPress={() => setShowLiveGlass(false)} style={st.liveGlassCloseIcon}>
                            <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={st.liveGlassBody}>
                        <Ionicons name="camera-outline" size={48} color={THEME.faint} />
                        <Text style={st.liveGlassPlaceholder}>WAITING FOR SIGNAL...</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowLiveGlass(false)} style={st.liveGlassCloseBtn} activeOpacity={0.7}>
                        <Text style={st.liveGlassCloseBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

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
    zapFlash: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#FFFFFF', zIndex: 50,
    },

    // Live Glass Modal
    liveGlassModal: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
        alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    liveGlassHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, width: '90%' },
    liveGlassDot: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: THEME.live,
        shadowColor: THEME.live, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10,
    },
    liveGlassTitle: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 2,
        color: THEME.live, textTransform: 'uppercase', fontWeight: '900',
    },
    liveGlassCloseIcon: {
        width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    liveGlassBody: {
        width: '90%', aspectRatio: 3 / 4, borderRadius: 32,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#000',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    liveGlassPlaceholder: {
        fontFamily: THEME.mono, fontSize: 10, color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase', marginTop: 12,
    },
    liveGlassCloseBtn: {
        marginTop: 24, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(245,243,235,0.2)',
    },
    liveGlassCloseBtnText: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900', letterSpacing: 2.2,
        color: THEME.muted, textTransform: 'uppercase',
    },

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
