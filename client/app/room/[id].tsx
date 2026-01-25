import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePiqabu } from '../../hooks/usePiqabu';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { Camera, CameraView } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import RevealDeck from '../../components/RevealDeck';
import PeepDeck from '../../components/PeepDeck';
import VideoControls from '../../components/VideoControls';

export default function Room() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const {
        linkStatus, joinRoom, leaveRoom,
        remoteText, sendText,
        remoteReveal, sendReveal,
        remoteWhisper, sendWhisper,
        videoControls: remoteVideoControls, updateVideoControls
    } = usePiqabu();

    const [localText, setLocalText] = useState('');
    const [showReveal, setShowReveal] = useState(false);
    const [showPeep, setShowPeep] = useState(false);
    const [showGlass, setShowGlass] = useState(false);
    const [showGlassControls, setShowGlassControls] = useState(false);

    const [glassSettings, setGlassSettings] = useState({ blur: 50, isBnW: true, isMuted: false });
    const [recording, setRecording] = useState<Audio.Recording | null>(null);

    useEffect(() => {
        if (id) joinRoom(id as string);
        return () => leaveRoom();
    }, [id]);

    useEffect(() => {
        updateVideoControls(glassSettings);
    }, [glassSettings]);

    // Audio Playback for Remote Whisper
    useEffect(() => {
        if (remoteWhisper) {
            playWhisper(remoteWhisper);
        }
    }, [remoteWhisper]);

    const playWhisper = async (base64: string) => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                { uri: base64 },
                { shouldPlay: true, rate: 0.85, shouldCorrectPitch: false } // Interrogator effect
            );
            await sound.playAsync();
        } catch (e) {
            console.error('Failed to play whisper', e);
        }
    };

    const startRecording = async () => {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
            setRecording(recording);
        } catch (e) {
            console.error('Failed to start recording', e);
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        setRecording(null);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            sendWhisper(`data:audio/m4a;base64,${base64}`);
        }
    };

    return (
        <View className="flex-1 bg-void">
            {/* Background Live Glass */}
            {showGlass && (
                <View className="absolute inset-0">
                    <CameraView style={StyleSheet.absoluteFill} facing="front" />
                    <BlurView
                        intensity={glassSettings.blur}
                        tint={glassSettings.isBnW ? 'dark' : 'default'}
                        style={StyleSheet.absoluteFill}
                    />
                    {glassSettings.isBnW && (
                        <View style={StyleSheet.absoluteFill} className="bg-void/40" />
                    )}
                </View>
            )}

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-12 pb-4 border-b border-ghost/20 bg-void/80 z-10">
                <View className="flex-row items-center">
                    <View className={`w-2 h-2 rounded-full mr-2 ${linkStatus === 'LINKED' ? 'bg-signal' : 'bg-amber'}`} />
                    <Text className="text-ghost font-mono text-[10px] uppercase tracking-[1px]">
                        {linkStatus}
                    </Text>
                </View>

                <View className="flex-row items-center space-x-4">
                    <TouchableOpacity
                        onPress={() => setShowGlass(!showGlass)}
                        className={`p-2 rounded ${showGlass ? 'bg-signal/20' : ''}`}
                    >
                        <Ionicons name="eye-outline" size={20} color={showGlass ? '#00FF9D' : '#333'} />
                    </TouchableOpacity>

                    <View className="bg-amber/20 px-3 py-1 rounded-full">
                        <Text className="text-amber font-mono text-[10px] font-bold">{id}</Text>
                    </View>
                </View>

                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="close-outline" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            {/* Main Interface (Split) */}
            <View className="flex-1">
                {/* Top: Co-Conspirator */}
                <View className="flex-1 border-b border-ghost/10 p-4">
                    <Text className="text-ghost font-mono text-[8px] uppercase tracking-[2px] mb-4">
                        ● Co-Conspirator [Remote Feed]
                    </Text>
                    <ScrollView className="flex-1">
                        <Text className="text-ghost font-mono text-xl">
                            {remoteText || (linkStatus === 'WAITING' ? 'Waiting for co-conspirator...' : 'Signal waiting...')}
                        </Text>
                    </ScrollView>
                </View>

                {/* Bottom: Conspirator (You) */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                    className="flex-1 p-4"
                >
                    <Text className="text-signal font-mono text-[8px] uppercase tracking-[2px] mb-4">
                        ● Conspirator (You) [Write • Expose]
                    </Text>
                    <TextInput
                        multiline
                        value={localText}
                        onChangeText={(text) => { setLocalText(text); sendText(text); }}
                        placeholder="Start transmission..."
                        placeholderTextColor="#333"
                        className="flex-1 text-signal font-mono text-xl"
                        style={{ textAlignVertical: 'top' }}
                    />

                    {/* Footer Controls */}
                    <View className="flex-row justify-around py-6 border-t border-ghost/20 bg-void/80 rounded-t-2xl">
                        <TouchableOpacity onPress={() => setShowPeep(true)} className="items-center">
                            <View className={remoteReveal ? 'animate-pulse' : ''}>
                                <Ionicons name="scan-outline" size={24} color={remoteReveal ? '#00FF9D' : '#333'} />
                            </View>
                            <Text className={`font-mono text-[8px] mt-1 ${remoteReveal ? 'text-signal' : 'text-ghost'}`}>PEEP</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPressIn={startRecording}
                            onPressOut={stopRecording}
                            className="items-center"
                        >
                            <View className={`w-12 h-12 rounded-full border items-center justify-center -mt-3 ${recording ? 'bg-destruct/20 border-destruct' : 'border-ghost bg-ghost/10'}`}>
                                <Ionicons name="mic-outline" size={28} color={recording ? '#FF453A' : '#333'} />
                            </View>
                            <Text className={`font-mono text-[8px] mt-1 ${recording ? 'text-destruct' : 'text-ghost'}`}>WHISPER</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setShowReveal(true)} className="items-center">
                            <Ionicons name="folder-outline" size={24} color="#333" />
                            <Text className="text-ghost font-mono text-[8px] mt-1">REVEAL</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>

            {/* Overlay Modals & Controls */}
            {showGlass && showGlassControls && (
                <VideoControls
                    blur={glassSettings.blur}
                    setBlur={(v: number) => setGlassSettings({ ...glassSettings, blur: v })}
                    isBnW={glassSettings.isBnW}
                    setBnW={(v: boolean) => setGlassSettings({ ...glassSettings, isBnW: v })}
                    isMuted={glassSettings.isMuted}
                    setMuted={(v: boolean) => setGlassSettings({ ...glassSettings, isMuted: v })}
                    onHide={() => setShowGlassControls(false)}
                />
            )}

            {showGlass && !showGlassControls && (
                <TouchableOpacity
                    onPress={() => setShowGlassControls(true)}
                    className="absolute bottom-32 right-4 bg-void/80 p-3 rounded-full border border-ghost/30"
                >
                    <Ionicons name="options-outline" size={20} color="#00FF9D" />
                </TouchableOpacity>
            )}

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

            <StatusBar style="light" />
        </View>
    );
}
