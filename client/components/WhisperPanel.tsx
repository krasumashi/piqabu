import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Modal, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type VoiceFilter = 'true' | 'ghost' | 'lowkey' | 'robot';

interface WhisperPanelProps {
    visible: boolean;
    onClose: () => void;
    onWhisperSend: (payload: string, filter: VoiceFilter) => void;
    maxDurationSec: number;
    whisperBadge: number;
}

export default function WhisperPanel({
    visible, onClose, onWhisperSend, maxDurationSec, whisperBadge,
}: WhisperPanelProps) {
    const slideAnim = useRef(new Animated.Value(400)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [selectedFilter, setSelectedFilter] = useState<VoiceFilter>('true');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const recorderStopRef = useRef<(() => Promise<void>) | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0, tension: 65, friction: 11, useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1, duration: 200, useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 400, duration: 200, useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0, duration: 200, useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    // Recording pulse animation
    useEffect(() => {
        if (isRecording) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [isRecording]);

    const handlePressIn = async () => {
        try {
            const { createAudioRecorder } = await import('../lib/platform/audio');
            const recorder = await createAudioRecorder();
            await recorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    if (prev >= maxDurationSec) {
                        // Auto-stop
                        handlePressOut();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);

            // Max duration guard
            const maxMs = maxDurationSec * 1000;
            const timeout = setTimeout(async () => {
                if (recorder.isRecording()) {
                    const result = await recorder.stop();
                    if (result) {
                        processAndSend(result);
                    }
                }
            }, maxMs);

            recorderStopRef.current = async () => {
                clearTimeout(timeout);
                if (timerRef.current) clearInterval(timerRef.current);
                const result = await recorder.stop();
                if (result) {
                    processAndSend(result);
                }
            };
        } catch (e) {
            console.error('Recording failed:', e);
        }
    };

    const handlePressOut = async () => {
        if (recorderStopRef.current) {
            await recorderStopRef.current();
            recorderStopRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        setIsRecording(false);
        setRecordingTime(0);
    };

    const processAndSend = async (rawPayload: string) => {
        if (selectedFilter === 'true' || Platform.OS !== 'web') {
            // No processing — send raw
            onWhisperSend(rawPayload, selectedFilter);
            return;
        }

        // Apply Web Audio filter for web platform
        try {
            const { applyVoiceFilter } = await import('../lib/platform/audioFilters');
            const processed = await applyVoiceFilter(rawPayload, selectedFilter);
            onWhisperSend(processed, selectedFilter);
        } catch (e) {
            console.error('Filter failed, sending raw:', e);
            onWhisperSend(rawPayload, selectedFilter);
        }
    };

    const FILTERS: { key: VoiceFilter; label: string; icon: string }[] = [
        { key: 'true', label: 'TRUE', icon: 'mic-outline' },
        { key: 'ghost', label: 'GHOST', icon: 'skull-outline' },
        { key: 'lowkey', label: 'LOW-KEY', icon: 'volume-low-outline' },
        { key: 'robot', label: 'ROBOT', icon: 'hardware-chip-outline' },
    ];

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="none" transparent>
            <Animated.View
                style={{ flex: 1, opacity: fadeAnim }}
                className="bg-void/95"
            >
                <View className="flex-1 justify-end pb-12 px-6">
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-6 pt-20">
                        <View>
                            <Text className="text-signal font-mono text-sm tracking-[4px] uppercase font-bold">
                                Whisper
                            </Text>
                            <Text className="text-ghost font-mono text-[8px] uppercase tracking-[1px] mt-1">
                                Hold to Speak {'\u2022'} Release to Vanish
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                            <Text className="text-ghost font-mono text-xs tracking-[2px] uppercase">Close</Text>
                        </TouchableOpacity>
                    </View>

                    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
                        {/* Voice Filter Selector */}
                        <View className="flex-row justify-between mb-8">
                            {FILTERS.map((f) => (
                                <TouchableOpacity
                                    key={f.key}
                                    onPress={() => setSelectedFilter(f.key)}
                                    activeOpacity={0.7}
                                    className={`flex-1 mx-1 py-3 rounded-xl border items-center ${
                                        selectedFilter === f.key
                                            ? 'bg-signal/10 border-signal'
                                            : 'border-ghost/30'
                                    }`}
                                >
                                    <Ionicons
                                        name={f.icon as any}
                                        size={20}
                                        color={selectedFilter === f.key ? '#00FF9D' : '#555'}
                                    />
                                    <Text
                                        className={`font-mono text-[7px] mt-1 uppercase tracking-[1px] ${
                                            selectedFilter === f.key ? 'text-signal font-bold' : 'text-ghost/50'
                                        }`}
                                    >
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Recording Timer */}
                        {isRecording && (
                            <View className="items-center mb-4">
                                <Text className="text-destruct font-mono text-2xl font-bold tracking-[4px]">
                                    {recordingTime}s / {maxDurationSec}s
                                </Text>
                            </View>
                        )}

                        {/* Big Record Button */}
                        <View className="items-center mb-8">
                            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                                <TouchableOpacity
                                    onPressIn={handlePressIn}
                                    onPressOut={handlePressOut}
                                    activeOpacity={0.8}
                                    className={`w-28 h-28 rounded-full border-2 items-center justify-center ${
                                        isRecording
                                            ? 'bg-destruct/20 border-destruct'
                                            : 'border-ghost/30'
                                    }`}
                                >
                                    <Ionicons
                                        name={isRecording ? 'radio' : 'mic-outline'}
                                        size={40}
                                        color={isRecording ? '#FF453A' : '#555'}
                                    />
                                    <Text
                                        className={`font-mono text-[8px] mt-2 uppercase tracking-[1px] ${
                                            isRecording ? 'text-destruct font-bold' : 'text-ghost/50'
                                        }`}
                                    >
                                        {isRecording ? 'Recording' : 'Hold'}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>

                        {/* Badge Indicator */}
                        {whisperBadge > 0 && (
                            <View className="items-center mb-4">
                                <View className="flex-row items-center bg-destruct/10 border border-destruct/30 rounded-full px-4 py-2">
                                    <Ionicons name="volume-high-outline" size={14} color="#FF453A" />
                                    <Text className="text-destruct font-mono text-[9px] ml-2 uppercase tracking-[1px]">
                                        {whisperBadge} Unheard
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Status */}
                        <View className="border border-ghost/20 rounded-xl p-3 mb-6">
                            <View className="flex-row justify-between items-center">
                                <Text className="text-ghost/50 font-mono text-[8px] uppercase tracking-[1px]">
                                    Filter
                                </Text>
                                <Text className="text-signal font-mono text-[9px] uppercase tracking-[1px] font-bold">
                                    {selectedFilter.toUpperCase()}
                                </Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Footer */}
                    <Text className="text-ghost/30 font-mono text-[7px] text-center uppercase tracking-[2px]">
                        No Playback. No History.
                    </Text>
                </View>
            </Animated.View>
        </Modal>
    );
}
