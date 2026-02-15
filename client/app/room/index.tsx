import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { useRoomContext } from '../../contexts/RoomContext';
import { useRoom, LinkStatus } from '../../hooks/useRoom';
import RoomTabBar from '../../components/RoomTabBar';
import RevealDeck from '../../components/RevealDeck';
import PeepDeck from '../../components/PeepDeck';
import FeatureTooltip from '../../components/FeatureTooltip';
import Paywall from '../../components/Paywall';

// Active Room Content component - isolated state per room
function RoomContent({ roomId }: { roomId: string }) {
    const { socket, deviceId, limits } = useRoomContext();
    const {
        linkStatus, remoteText, remoteReveal, remoteWhisper,
        sendText, sendReveal,
    } = useRoom(roomId, socket, deviceId);

    const [localText, setLocalText] = useState('');
    const [showReveal, setShowReveal] = useState(false);
    const [showPeep, setShowPeep] = useState(false);

    // Audio playback for remote whisper
    useEffect(() => {
        if (remoteWhisper) {
            import('../../lib/platform/audio').then(({ playAudioFromDataUri }) => {
                playAudioFromDataUri(remoteWhisper, 0.85);
            });
        }
    }, [remoteWhisper]);

    const handleRecord = async () => {
        const { createAudioRecorder } = await import('../../lib/platform/audio');
        const recorder = await createAudioRecorder();
        await recorder.start();

        // Auto-stop after tier-based duration limit
        const maxMs = limits.whisperDurationSec * 1000;
        const timeout = setTimeout(async () => {
            if (recorder.isRecording()) {
                const result = await recorder.stop();
                if (result) {
                    socket?.emit('transmit_whisper', { roomId, payload: result });
                }
            }
        }, maxMs);

        return async () => {
            clearTimeout(timeout);
            const result = await recorder.stop();
            if (result) {
                socket?.emit('transmit_whisper', { roomId, payload: result });
            }
        };
    };

    const recorderStopRef = useRef<(() => Promise<void>) | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const onPressIn = async () => {
        try {
            const stopFn = await handleRecord();
            recorderStopRef.current = stopFn;
            setIsRecording(true);
        } catch (e) {
            console.error('Recording failed:', e);
        }
    };

    const onPressOut = async () => {
        if (recorderStopRef.current) {
            await recorderStopRef.current();
            recorderStopRef.current = null;
        }
        setIsRecording(false);
    };

    return (
        <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
                <View className="flex-row items-center">
                    <View className={`w-2 h-2 rounded-full mr-2 ${linkStatus === 'LINKED' ? 'bg-signal' : linkStatus === 'WAITING' ? 'bg-amber' : 'bg-destruct'}`} />
                    <Text className="text-ghost font-mono text-[10px] uppercase tracking-[1px]">
                        {linkStatus}
                    </Text>
                </View>
                <View className="bg-amber/20 px-3 py-1 rounded-full">
                    <Text className="text-amber font-mono text-[10px] font-bold">{roomId}</Text>
                </View>
            </View>

            {/* Main Interface (Split) */}
            <View className="flex-1">
                {/* Top: Remote */}
                <View className="flex-1 border-b border-ghost/10 p-4">
                    <Text className="text-ghost font-mono text-[8px] uppercase tracking-[2px] mb-4">
                        {'\u25CF'} Co-Conspirator [Remote Feed]
                    </Text>
                    <ScrollView className="flex-1">
                        <Text className="text-ghost font-mono text-xl">
                            {remoteText || (linkStatus === 'WAITING' ? 'Waiting for co-conspirator...' : 'Signal waiting...')}
                        </Text>
                    </ScrollView>
                </View>

                {/* Bottom: Local */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                    className="flex-1 p-4"
                >
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-signal font-mono text-[8px] uppercase tracking-[2px]">
                            {'\u25CF'} Conspirator (You) [Write {'\u2022'} Expose]
                        </Text>
                        <Text className="text-ghost/50 font-mono text-[8px]">
                            {localText.length}/{limits.textLimit}
                        </Text>
                    </View>
                    <TextInput
                        multiline
                        value={localText}
                        onChangeText={(text) => {
                            if (text.length > limits.textLimit) return;
                            setLocalText(text);
                            sendText(text);
                        }}
                        placeholder="Start transmission..."
                        placeholderTextColor="#333"
                        className="flex-1 text-signal font-mono text-xl"
                        style={{ textAlignVertical: 'top' }}
                    />

                    {/* Footer Controls */}
                    <View className="flex-row justify-around py-6 border-t border-ghost/20 bg-void/80 rounded-t-2xl">
                        <FeatureTooltip featureKey="peep" text="View what your co-conspirator reveals" position="above">
                            <TouchableOpacity onPress={() => setShowPeep(true)} className="items-center">
                                <View className={remoteReveal ? 'animate-pulse' : ''}>
                                    <Ionicons name="scan-outline" size={24} color={remoteReveal ? '#00FF9D' : '#333'} />
                                </View>
                                <Text className={`font-mono text-[8px] mt-1 ${remoteReveal ? 'text-signal' : 'text-ghost'}`}>PEEP</Text>
                            </TouchableOpacity>
                        </FeatureTooltip>

                        <FeatureTooltip featureKey="whisper" text="Hold to record a voice-distorted message" position="above">
                            <TouchableOpacity
                                onPressIn={onPressIn}
                                onPressOut={onPressOut}
                                className="items-center"
                            >
                                <View className={`w-12 h-12 rounded-full border items-center justify-center -mt-3 ${isRecording ? 'bg-destruct/20 border-destruct' : 'border-ghost bg-ghost/10'}`}>
                                    <Ionicons name="mic-outline" size={28} color={isRecording ? '#FF453A' : '#333'} />
                                </View>
                                <Text className={`font-mono text-[8px] mt-1 ${isRecording ? 'text-destruct' : 'text-ghost'}`}>WHISPER</Text>
                            </TouchableOpacity>
                        </FeatureTooltip>

                        <FeatureTooltip featureKey="reveal" text="Select an image to share on your terms" position="above">
                            <TouchableOpacity onPress={() => setShowReveal(true)} className="items-center">
                                <Ionicons name="folder-outline" size={24} color="#333" />
                                <Text className="text-ghost font-mono text-[8px] mt-1">REVEAL</Text>
                            </TouchableOpacity>
                        </FeatureTooltip>
                    </View>
                </KeyboardAvoidingView>
            </View>

            {/* Overlays */}
            <RevealDeck
                visible={showReveal}
                onClose={() => setShowReveal(false)}
                onReveal={sendReveal}
            />

            <PeepDeck
                visible={showPeep}
                onClose={() => setShowPeep(false)}
                remoteImage={remoteReveal}
            />
        </View>
    );
}

// Main Room Screen with Tab Support
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

    // Track link statuses for the tab bar
    const [roomStatuses, setRoomStatuses] = useState<Record<string, LinkStatus>>({});

    useEffect(() => {
        if (!socket) return;

        const handleLinkStatus = (data: { roomId: string; status: LinkStatus }) => {
            setRoomStatuses(prev => ({ ...prev, [data.roomId]: data.status }));
        };

        socket.on('link_status', handleLinkStatus);
        return () => { socket.off('link_status', handleLinkStatus); };
    }, [socket]);

    // If no rooms, go back to Signal Tower
    useEffect(() => {
        if (rooms.length === 0) {
            router.replace('/');
        }
    }, [rooms.length]);

    const handleAddRoom = () => {
        setShowAddModal(true);
    };

    const tryAddRoom = (code: string): boolean => {
        const result = addRoom(code);
        if (!result.success) {
            // Room limit hit - show paywall instead of alert
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
            if (tryAddRoom(code)) {
                setShowAddModal(false);
            }
        } catch (e) {
            Alert.alert('Error', 'Unable to create room.');
        }
    };

    const handleJoinNewRoom = () => {
        if (newCode.length !== 6) return;
        if (tryAddRoom(newCode.toUpperCase())) {
            setNewCode('');
            setShowAddModal(false);
        }
    };

    const handleCloseRoom = (roomId: string) => {
        removeRoom(roomId);
    };

    const handleSubscribed = async () => {
        await refreshSubscription();
    };

    if (!activeRoomId) return null;

    return (
        <View className="flex-1 bg-void">
            {/* Top Bar */}
            <View className="flex-row items-center justify-between px-4 pt-12 pb-2 border-b border-ghost/20 bg-void z-10">
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="chevron-back-outline" size={24} color="#333" />
                </TouchableOpacity>

                <View className="flex-row items-center">
                    <View className={`w-1.5 h-1.5 rounded-full mr-2 ${isConnected ? 'bg-signal' : 'bg-destruct'}`} />
                    <Text className="text-ghost font-mono text-[9px] uppercase tracking-[1px]">
                        {isConnected ? 'CONNECTED' : 'RECONNECTING'}
                    </Text>
                </View>

                <TouchableOpacity onPress={() => {
                    rooms.forEach(r => removeRoom(r.roomId));
                    router.replace('/');
                }}>
                    <Ionicons name="close-outline" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <RoomTabBar
                rooms={rooms}
                activeRoomId={activeRoomId}
                roomStatuses={roomStatuses}
                onSwitchRoom={switchRoom}
                onAddRoom={handleAddRoom}
                onCloseRoom={handleCloseRoom}
            />

            {/* Active Room Content */}
            <RoomContent key={activeRoomId} roomId={activeRoomId} />

            {/* Add Room Modal */}
            <Modal visible={showAddModal} animationType="fade" transparent>
                <View className="flex-1 bg-void/95 justify-center p-8">
                    <View className="bg-void border border-ghost/40 rounded-2xl p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-signal font-mono text-xs tracking-[2px] uppercase">Add Room</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                <Ionicons name="close-outline" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            value={newCode}
                            onChangeText={(v) => setNewCode(v.toUpperCase())}
                            placeholder="_ _ _ _ _ _"
                            placeholderTextColor="#333"
                            className="bg-ghost/10 border border-ghost p-4 text-signal font-mono text-xl text-center rounded-xl mb-4"
                            maxLength={6}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />

                        <TouchableOpacity
                            onPress={handleJoinNewRoom}
                            disabled={newCode.length !== 6}
                            className={`p-4 rounded-xl border mb-4 ${newCode.length === 6 ? 'bg-signal border-signal' : 'border-ghost opacity-50'}`}
                        >
                            <Text className={`text-center font-mono font-bold uppercase tracking-[2px] ${newCode.length === 6 ? 'text-void' : 'text-ghost'}`}>
                                Join Frequency
                            </Text>
                        </TouchableOpacity>

                        <View className="flex-row items-center my-2">
                            <View className="flex-1 h-[1px] bg-ghost/30" />
                            <Text className="text-ghost font-mono text-[10px] mx-4 uppercase">OR</Text>
                            <View className="flex-1 h-[1px] bg-ghost/30" />
                        </View>

                        <TouchableOpacity
                            onPress={handleCreateNewRoom}
                            className="p-4 rounded-xl border border-signal mt-2"
                        >
                            <Text className="text-signal text-center font-mono font-bold uppercase tracking-[2px]">
                                New Handshake
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Paywall */}
            <Paywall
                visible={showPaywall}
                feature={paywallFeature}
                onDismiss={() => setShowPaywall(false)}
                deviceId={deviceId}
                onSubscribed={handleSubscribed}
            />

            <StatusBar style="light" />
        </View>
    );
}
