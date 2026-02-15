import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
    Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

export type VoiceFilter = 'true' | 'ghost' | 'lowkey' | 'robot';

interface WhisperPanelProps {
    visible: boolean;
    onClose: () => void;
    onWhisperSend: (payload: string, filter: VoiceFilter) => void;
    maxDurationSec: number;
    whisperBadge: number;
}

const VOICE_CHIPS: { label: string; val: VoiceFilter }[] = [
    { label: 'TRUE', val: 'true' },
    { label: 'GHOST', val: 'ghost' },
    { label: 'LOW-KEY', val: 'lowkey' },
    { label: 'ROBOT', val: 'robot' },
];

export default function WhisperPanel({
    visible, onClose, onWhisperSend, maxDurationSec, whisperBadge,
}: WhisperPanelProps) {
    const slideAnim = useRef(new RNAnimated.Value(400)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;
    const [selectedFilter, setSelectedFilter] = useState<VoiceFilter>('true');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const recorderStopRef = useRef<(() => Promise<void>) | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        } else {
            RNAnimated.parallel([
                RNAnimated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const handlePressIn = async () => {
        try {
            const { createAudioRecorder } = await import('../lib/platform/audio');
            const recorder = await createAudioRecorder();
            await recorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    if (prev >= maxDurationSec) {
                        handlePressOut();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);

            const maxMs = maxDurationSec * 1000;
            const timeout = setTimeout(async () => {
                if (recorder.isRecording()) {
                    const result = await recorder.stop();
                    if (result) processAndSend(result);
                }
            }, maxMs);

            recorderStopRef.current = async () => {
                clearTimeout(timeout);
                if (timerRef.current) clearInterval(timerRef.current);
                const result = await recorder.stop();
                if (result) processAndSend(result);
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
            onWhisperSend(rawPayload, selectedFilter);
            return;
        }
        try {
            const { applyVoiceFilter } = await import('../lib/platform/audioFilters');
            const processed = await applyVoiceFilter(rawPayload, selectedFilter);
            onWhisperSend(processed, selectedFilter);
        } catch (e) {
            console.error('Filter failed, sending raw:', e);
            onWhisperSend(rawPayload, selectedFilter);
        }
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
                        <Text style={styles.headerTitle}>WHISPER</Text>
                        <Text style={styles.headerSub}>HOLD TO SPEAK • RELEASE TO VANISH</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.body}>
                    {/* Voice Chips */}
                    <View style={styles.chipsRow}>
                        {VOICE_CHIPS.map(chip => (
                            <TouchableOpacity
                                key={chip.label}
                                onPress={() => setSelectedFilter(chip.val)}
                                style={[
                                    styles.chip,
                                    selectedFilter === chip.val && styles.chipActive,
                                ]}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    styles.chipText,
                                    selectedFilter === chip.val && styles.chipTextActive,
                                ]}>
                                    {chip.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* PTT Button */}
                    <TouchableOpacity
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        activeOpacity={0.8}
                        style={[styles.pttBtn, isRecording && styles.pttBtnActive]}
                    >
                        <Text style={[styles.pttLabel, isRecording && styles.pttLabelActive]}>
                            {isRecording ? 'TRANSMITTING...' : 'HOLD TO WHISPER'}
                        </Text>
                        <Text style={styles.pttStatus}>
                            {isRecording ? `LIVE • ${recordingTime}s` : 'IDLE'}
                        </Text>
                    </TouchableOpacity>

                    {/* Wave Bar */}
                    <View style={styles.waveBar}>
                        {whisperBadge > 0 ? (
                            <Text style={styles.waveText}>INCOMING TRANSMISSION...</Text>
                        ) : (
                            <View style={styles.waveDots}>
                                {[0.1, 0.35, 0.65, 0.9].map((pos, i) => (
                                    <View key={i} style={[styles.waveDot, { left: `${pos * 100}%` }]} />
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Footer */}
                    <Text style={styles.footer}>NO PLAYBACK. NO HISTORY.</Text>
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
    body: {
        padding: 14,
        gap: 12,
    },
    chipsRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    chip: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: THEME.edge,
    },
    chipActive: {
        borderColor: 'rgba(255,255,255,0.40)',
    },
    chipText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.20,
        fontWeight: '900',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    chipTextActive: {
        color: THEME.ink,
    },
    pttBtn: {
        width: '100%',
        height: 160,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.22)',
        backgroundColor: 'rgba(0,0,0,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    pttBtnActive: {
        borderWidth: 2,
        borderColor: THEME.accEmerald,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    pttLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.28,
        fontWeight: '900',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    pttLabelActive: {
        color: THEME.accEmerald,
    },
    pttStatus: {
        fontFamily: THEME.mono,
        fontSize: 12,
        letterSpacing: 12 * 0.12,
        fontWeight: '900',
        color: THEME.ink,
        opacity: 0.92,
        textTransform: 'uppercase',
    },
    waveBar: {
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(0,0,0,0.10)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.2,
        color: THEME.accSky,
        textTransform: 'uppercase',
    },
    waveDots: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    waveDot: {
        position: 'absolute',
        top: '50%',
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.10)',
        marginTop: -3,
    },
    footer: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
});
