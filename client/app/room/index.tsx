import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
    Platform, ScrollView, Alert, Modal, Animated, Keyboard, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { useRoomContext } from '../../contexts/RoomContext';
import { useRoom, LinkStatus } from '../../hooks/useRoom';
import RoomTabBar from '../../components/RoomTabBar';
import RevealDeck from '../../components/RevealDeck';
import PeepDeck from '../../components/PeepDeck';
import FeatureTooltip from '../../components/FeatureTooltip';
import SettingsPanel from '../../components/SettingsPanel';
import WhisperPanel from '../../components/WhisperPanel';
import Paywall from '../../components/Paywall';
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

    if (displayChars.length === 0 && !isDecaying) {
        return null;
    }

    return (
        <Text className="font-mono text-lg leading-7">
            {displayChars.map((char, i) => {
                const isPendingDecay = isDecaying && decayIndex >= 0 && i >= decayIndex;
                const isPreFade = isDecaying && decayIndex >= 0 && i >= decayIndex - 8 && i < decayIndex;
                return (
                    <Text
                        key={i}
                        style={{
                            color: isPendingDecay ? 'transparent' : isPreFade ? '#333333' : '#888888',
                            opacity: isPendingDecay ? 0 : isPreFade ? 0.3 : 1,
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
    const dotAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isTyping) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                    Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            dotAnim.stopAnimation();
            dotAnim.setValue(0);
        }
    }, [isTyping]);

    if (!isTyping) return null;

    return (
        <Animated.Text style={{ opacity: dotAnim }} className="text-signal font-mono text-[8px] ml-2">
            typing...
        </Animated.Text>
    );
}

// ─── Pulse Dot ───
function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={{
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: color, opacity: pulseAnim,
            }}
        />
    );
}

// ─── Button Press Scale Hook ───
function useButtonScale() {
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => Animated.spring(scale, { toValue: 0.92, friction: 5, useNativeDriver: true }).start();
    const pressOut = () => Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    return { scale, pressIn, pressOut };
}

// ─── Zap Flash Overlay ───
function ZapFlash({ active }: { active: boolean }) {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (active) {
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.6, duration: 60, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
            ]).start();
        }
    }, [active]);

    if (!active) return null;

    return (
        <Animated.View
            style={{ opacity }}
            className="absolute inset-0 bg-signal z-50"
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
    const [showReveal, setShowReveal] = useState(false);
    const [showPeep, setShowPeep] = useState(false);
    const [showWhisperPanel, setShowWhisperPanel] = useState(false);
    const [isRemoteDecaying, setIsRemoteDecaying] = useState(false);
    const [isLocalDecaying, setIsLocalDecaying] = useState(false);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [whisperBadge, setWhisperBadge] = useState(0);
    const [zapFlash, setZapFlash] = useState(false);
    const [roomCodeCopied, setRoomCodeCopied] = useState(false);

    // ── Keyboard-aware dynamic split ──
    const remoteFlex = useRef(new Animated.Value(1)).current;
    const localFlex = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => {
            Animated.parallel([
                Animated.timing(remoteFlex, { toValue: 0.6, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
                Animated.timing(localFlex, { toValue: 1.4, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
            ]).start();
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            Animated.parallel([
                Animated.timing(remoteFlex, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
                Animated.timing(localFlex, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
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

    // ── Whisper playback + badge ──
    useEffect(() => {
        if (remoteWhisper) {
            setWhisperBadge(prev => prev + 1);
            import('../../lib/platform/audio').then(({ playAudioFromDataUri }) => {
                playAudioFromDataUri(remoteWhisper, 0.85);
                setTimeout(() => setWhisperBadge(0), 5000);
            });
        }
    }, [remoteWhisper]);

    // ── Whisper send (from WhisperPanel) ──
    const handleWhisperSend = useCallback((payload: string, _filter: VoiceFilter) => {
        socket?.emit('transmit_whisper', { roomId, payload, filter: _filter });
        setShowWhisperPanel(false);
    }, [socket, roomId]);

    // ── Quick whisper recording (bottom bar hold) ──
    const recorderStopRef = useRef<(() => Promise<void>) | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const handleRecord = async () => {
        const { createAudioRecorder } = await import('../../lib/platform/audio');
        const recorder = await createAudioRecorder();
        await recorder.start();
        const maxMs = limits.whisperDurationSec * 1000;
        const timeout = setTimeout(async () => {
            if (recorder.isRecording()) {
                const result = await recorder.stop();
                if (result) socket?.emit('transmit_whisper', { roomId, payload: result });
            }
        }, maxMs);
        return async () => {
            clearTimeout(timeout);
            const result = await recorder.stop();
            if (result) socket?.emit('transmit_whisper', { roomId, payload: result });
        };
    };

    const onPressIn = async () => {
        try {
            const stopFn = await handleRecord();
            recorderStopRef.current = stopFn;
            setIsRecording(true);
        } catch (e) { console.error('Recording failed:', e); }
    };

    const onPressOut = async () => {
        if (recorderStopRef.current) {
            await recorderStopRef.current();
            recorderStopRef.current = null;
        }
        setIsRecording(false);
    };

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

    const peepBtn = useButtonScale();
    const whisperBtn = useButtonScale();
    const revealBtn = useButtonScale();
    const zapBtn = useButtonScale();
    const cameraBtn = useButtonScale();

    const isLinked = linkStatus === 'LINKED';

    return (
        <View className="flex-1">
            {/* Zap Flash Overlay */}
            <ZapFlash active={zapFlash} />

            {/* ─── Room Top Bar (per screenshot) ─── */}
            <View className="flex-row items-center px-3 py-2 border-b border-ghost/10">
                {/* Status Pill */}
                <View className={`flex-row items-center px-2.5 py-1.5 rounded-full border ${isLinked ? 'border-signal/30' : 'border-amber/30'}`}>
                    <PulseDot color={isLinked ? '#00FF9D' : '#FFB800'} />
                    <Text className={`font-mono text-[7px] ml-1.5 uppercase tracking-[1px] leading-3 ${isLinked ? 'text-signal' : 'text-amber'}`}>
                        {isLinked ? 'Partner\nActive' : 'Waiting'}
                    </Text>
                </View>

                {/* Camera */}
                <Animated.View style={{ transform: [{ scale: cameraBtn.scale }] }}>
                    <TouchableOpacity
                        onPress={onOpenLiveGlass}
                        onPressIn={cameraBtn.pressIn}
                        onPressOut={cameraBtn.pressOut}
                        className="ml-2.5 p-2"
                        activeOpacity={0.6}
                    >
                        <Ionicons name="camera-outline" size={18} color="#555" />
                    </TouchableOpacity>
                </Animated.View>

                {/* Zap / Vanish */}
                <Animated.View style={{ transform: [{ scale: zapBtn.scale }] }}>
                    <TouchableOpacity
                        onPress={handleVanish}
                        onPressIn={zapBtn.pressIn}
                        onPressOut={zapBtn.pressOut}
                        className="p-2"
                        activeOpacity={0.6}
                    >
                        <Ionicons name="flash" size={18} color="#FFB800" />
                    </TouchableOpacity>
                </Animated.View>

                {/* Room Code */}
                <View className="flex-1 items-center">
                    <TouchableOpacity activeOpacity={0.6} onPress={handleCopyRoomCode}>
                        <Text className={`font-mono text-[10px] tracking-[3px] ${roomCodeCopied ? 'text-signal' : 'text-ghost/60'}`}>
                            {roomCodeCopied ? 'COPIED' : roomId}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Settings */}
                <TouchableOpacity onPress={onOpenSettings} className="p-2" activeOpacity={0.6}>
                    <Ionicons name="settings-outline" size={18} color="#555" />
                </TouchableOpacity>
            </View>

            {/* ─── Split Interface ─── */}
            <View className="flex-1">
                {/* Remote Feed */}
                <Animated.View style={{ flex: remoteFlex }} className="border-b border-ghost/10 p-4">
                    <View className="flex-row items-center mb-3">
                        <View className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-2" />
                        <Text className="text-ghost font-mono text-[8px] uppercase tracking-[2px]">Co-Conspirator</Text>
                        <TypingIndicator isTyping={isPartnerTyping} />
                        <View className="flex-1" />
                        <Text className="text-ghost/30 font-mono text-[7px] uppercase tracking-[1px]">Remote Feed</Text>
                    </View>
                    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                        {remoteText || isRemoteDecaying ? (
                            <DecayText text={remoteText} isDecaying={isRemoteDecaying} />
                        ) : (
                            <Text className="text-ghost/30 font-mono text-lg italic">
                                {linkStatus === 'WAITING' ? 'Waiting for co-conspirator...' : 'Signal waiting...'}
                            </Text>
                        )}
                    </ScrollView>
                </Animated.View>

                {/* Local Input */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                    style={{ flex: 1 }}
                >
                    <Animated.View style={{ flex: localFlex }} className="p-4">
                        <View className="flex-row justify-between items-center mb-3">
                            <View className="flex-row items-center">
                                <View className="w-1.5 h-1.5 rounded-full bg-amber mr-2" />
                                <Text className="text-amber font-mono text-[8px] uppercase tracking-[2px]">Conspirator (You)</Text>
                            </View>
                            <Text className="text-ghost/30 font-mono text-[7px] uppercase tracking-[1px]">
                                Write {'\u2022'} Expose
                            </Text>
                        </View>

                        {isLocalDecaying ? (
                            <View className="flex-1">
                                <DecayText text={localText} isDecaying={true} />
                            </View>
                        ) : (
                            <TextInput
                                multiline
                                value={localText}
                                onChangeText={(text) => {
                                    if (text.length > limits.textLimit) return;
                                    setLocalText(text);
                                    batchSendText(text);
                                }}
                                placeholder="Start transmission..."
                                placeholderTextColor="#333"
                                className="flex-1 text-signal font-mono text-lg"
                                style={{ textAlignVertical: 'top' }}
                            />
                        )}

                        {/* ─── Footer Controls ─── */}
                        <View className="flex-row justify-around py-4 border-t border-ghost/10 mt-2">
                            <FeatureTooltip featureKey="peep" text="View what your co-conspirator reveals" position="above">
                                <Animated.View style={{ transform: [{ scale: peepBtn.scale }] }}>
                                    <TouchableOpacity
                                        onPress={() => setShowPeep(true)}
                                        onPressIn={peepBtn.pressIn}
                                        onPressOut={peepBtn.pressOut}
                                        className="items-center px-5"
                                    >
                                        <Ionicons name="eye-outline" size={22} color={remoteReveal ? '#00FF9D' : '#555'} />
                                        <Text className={`font-mono text-[7px] mt-1 uppercase tracking-[1px] ${remoteReveal ? 'text-signal' : 'text-ghost/50'}`}>
                                            Peep
                                        </Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </FeatureTooltip>

                            <FeatureTooltip featureKey="whisper" text="Tap for filters, or hold to quick-record" position="above">
                                <Animated.View style={{ transform: [{ scale: whisperBtn.scale }] }}>
                                    <TouchableOpacity
                                        onPress={() => setShowWhisperPanel(true)}
                                        onLongPress={() => { onPressIn(); }}
                                        onPressIn={whisperBtn.pressIn}
                                        onPressOut={() => {
                                            whisperBtn.pressOut();
                                            if (isRecording) onPressOut();
                                        }}
                                        className="items-center px-5"
                                        delayLongPress={300}
                                    >
                                        <View className={`w-12 h-12 rounded-full border items-center justify-center -mt-2 ${isRecording ? 'bg-destruct/20 border-destruct' : 'border-ghost/30'}`}>
                                            <Ionicons name="mic-outline" size={22} color={isRecording ? '#FF453A' : '#555'} />
                                            {whisperBadge > 0 && (
                                                <View className="absolute -top-1 -right-1 bg-destruct w-5 h-5 rounded-full items-center justify-center">
                                                    <Text className="text-white font-mono text-[7px] font-bold">{whisperBadge}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text className={`font-mono text-[7px] mt-1 uppercase tracking-[1px] ${isRecording ? 'text-destruct' : 'text-ghost/50'}`}>
                                            Whisper
                                        </Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </FeatureTooltip>

                            <FeatureTooltip featureKey="reveal" text="Select an image to share" position="above">
                                <Animated.View style={{ transform: [{ scale: revealBtn.scale }] }}>
                                    <TouchableOpacity
                                        onPress={() => setShowReveal(true)}
                                        onPressIn={revealBtn.pressIn}
                                        onPressOut={revealBtn.pressOut}
                                        className="items-center px-5"
                                    >
                                        <Ionicons name="folder-outline" size={22} color="#555" />
                                        <Text className="text-ghost/50 font-mono text-[7px] mt-1 uppercase tracking-[1px]">Reveal</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </FeatureTooltip>
                        </View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </View>

            {/* ─── Overlays ─── */}
            <RevealDeck
                visible={showReveal}
                onClose={() => setShowReveal(false)}
                onReveal={sendReveal}
                onOpenLiveMirror={() => {
                    setShowReveal(false);
                    Alert.alert('Coming Soon', 'Live Mirror screen sharing will be available in a future update.');
                }}
            />
            <PeepDeck visible={showPeep} onClose={() => setShowPeep(false)} remoteImage={remoteReveal} />
            <WhisperPanel
                visible={showWhisperPanel}
                onClose={() => setShowWhisperPanel(false)}
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

    // ── Fade-in animation for the whole screen ──
    const screenFade = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(screenFade, {
            toValue: 1, duration: 400, useNativeDriver: true,
        }).start();
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
        <Animated.View style={{ flex: 1, opacity: screenFade }} className="bg-void">
            {/* ─── Global Nav ─── */}
            <View className="flex-row items-center justify-between px-4 pt-12 pb-1 bg-void z-10">
                <TouchableOpacity onPress={() => router.back()} className="p-1">
                    <Ionicons name="chevron-back-outline" size={20} color="#555" />
                </TouchableOpacity>
                <View className="flex-row items-center">
                    <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-signal' : 'bg-destruct'}`} />
                    <Text className="text-ghost/50 font-mono text-[7px] uppercase tracking-[1px]">
                        {isConnected ? 'Signal Active' : 'Reconnecting'}
                    </Text>
                </View>
                <TouchableOpacity onPress={() => { rooms.forEach(r => removeRoom(r.roomId)); router.replace('/'); }} className="p-1">
                    <Ionicons name="close-outline" size={20} color="#555" />
                </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <RoomTabBar
                rooms={rooms} activeRoomId={activeRoomId} roomStatuses={roomStatuses}
                onSwitchRoom={switchRoom} onAddRoom={() => setShowAddModal(true)}
                onCloseRoom={(id) => removeRoom(id)}
            />

            {/* Active Room */}
            <RoomContent
                key={activeRoomId} roomId={activeRoomId}
                onOpenSettings={() => setShowSettings(true)}
                onOpenLiveGlass={() => setShowLiveGlass(true)}
            />

            {/* ─── Settings ─── */}
            <SettingsPanel
                visible={showSettings} onClose={() => setShowSettings(false)}
                roomId={activeRoomId} linkStatus={roomStatuses[activeRoomId] || 'WAITING'}
                onRegenerateKey={handleRegenerateKey} onLeaveChannel={handleLeaveChannel}
            />

            {/* ─── Live Glass Modal (Phase F placeholder) ─── */}
            <Modal visible={showLiveGlass} animationType="slide" transparent>
                <View className="flex-1 bg-void/98 justify-center items-center p-6">
                    <View className="flex-row items-center mb-8">
                        <PulseDot color="#FF453A" size={8} />
                        <Text className="text-signal font-mono text-sm ml-2 tracking-[4px] uppercase font-bold">
                            Live Glass
                        </Text>
                    </View>

                    <View className="w-full h-64 border border-ghost/30 rounded-2xl items-center justify-center mb-6">
                        <Ionicons name="camera-outline" size={48} color="#333" />
                        <Text className="text-ghost/40 font-mono text-xs uppercase tracking-[2px] mt-4">
                            Camera Feed
                        </Text>
                        <Text className="text-ghost/20 font-mono text-[8px] uppercase tracking-[1px] mt-2">
                            WebRTC Integration Coming
                        </Text>
                    </View>

                    <View className="flex-row gap-4 mb-8">
                        <View className="flex-1 border border-ghost/20 rounded-xl p-3 items-center">
                            <Ionicons name="eye-outline" size={18} color="#555" />
                            <Text className="text-ghost/40 font-mono text-[7px] mt-1 uppercase">Live</Text>
                        </View>
                        <View className="flex-1 border border-ghost/20 rounded-xl p-3 items-center">
                            <Ionicons name="contrast-outline" size={18} color="#555" />
                            <Text className="text-ghost/40 font-mono text-[7px] mt-1 uppercase">Noir</Text>
                        </View>
                        <View className="flex-1 border border-ghost/20 rounded-xl p-3 items-center">
                            <Ionicons name="mic-outline" size={18} color="#555" />
                            <Text className="text-ghost/40 font-mono text-[7px] mt-1 uppercase">Audio</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={() => setShowLiveGlass(false)}
                        className="border border-ghost/30 rounded-xl px-8 py-3"
                        activeOpacity={0.7}
                    >
                        <Text className="text-ghost font-mono text-xs uppercase tracking-[2px]">Close</Text>
                    </TouchableOpacity>

                    <Text className="text-ghost/20 font-mono text-[7px] text-center mt-6 uppercase tracking-[1px]">
                        Waiting for Signal...
                    </Text>
                </View>
            </Modal>

            {/* Add Room Modal */}
            <Modal visible={showAddModal} animationType="fade" transparent>
                <View className="flex-1 bg-void/95 justify-center p-8">
                    <View className="bg-void border border-ghost/40 rounded-2xl p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-signal font-mono text-xs tracking-[2px] uppercase font-bold">Add Room</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                <Ionicons name="close-outline" size={24} color="#555" />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            value={newCode} onChangeText={(v) => setNewCode(v.toUpperCase())}
                            placeholder="_ _ _ _ _ _" placeholderTextColor="#333"
                            className="bg-ghost/10 border border-ghost/40 p-4 text-signal font-mono text-xl text-center rounded-xl mb-4"
                            maxLength={6} autoCapitalize="characters" autoCorrect={false}
                        />
                        <TouchableOpacity
                            onPress={handleJoinNewRoom} disabled={newCode.length !== 6}
                            className={`p-4 rounded-xl border mb-4 ${newCode.length === 6 ? 'bg-signal border-signal' : 'border-ghost/30 opacity-50'}`}
                        >
                            <Text className={`text-center font-mono font-bold uppercase tracking-[2px] ${newCode.length === 6 ? 'text-void' : 'text-ghost'}`}>
                                Join Frequency
                            </Text>
                        </TouchableOpacity>
                        <View className="flex-row items-center my-2">
                            <View className="flex-1 h-[1px] bg-ghost/20" />
                            <Text className="text-ghost/40 font-mono text-[10px] mx-4 uppercase">OR</Text>
                            <View className="flex-1 h-[1px] bg-ghost/20" />
                        </View>
                        <TouchableOpacity onPress={handleCreateNewRoom} className="p-4 rounded-xl border border-signal mt-2">
                            <Text className="text-signal text-center font-mono font-bold uppercase tracking-[2px]">New Handshake</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Paywall */}
            <Paywall
                visible={showPaywall} feature={paywallFeature}
                onDismiss={() => setShowPaywall(false)} deviceId={deviceId}
                onSubscribed={async () => { await refreshSubscription(); }}
            />

            <StatusBar style="light" />
        </Animated.View>
    );
}
