import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, Pressable, StyleSheet, Platform,
    Animated as RNAnimated, PermissionsAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import type { Socket } from 'socket.io-client';

/* ─────────── platform-specific WebRTC imports ─────────── */

let RNWebRTC: any = null;
if (Platform.OS !== 'web') {
    try {
        RNWebRTC = require('react-native-webrtc');
    } catch {}
}

const NativeRTCPC: typeof RTCPeerConnection | undefined = RNWebRTC?.RTCPeerConnection;
const NativeRTCSD: typeof RTCSessionDescription | undefined = RNWebRTC?.RTCSessionDescription;
const NativeRTCIC: typeof RTCIceCandidate | undefined = RNWebRTC?.RTCIceCandidate;
const nativeMediaDevices: typeof navigator.mediaDevices | undefined = RNWebRTC?.mediaDevices;

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

/* ─────────────────────── types ─────────────────────────── */

type WhisperState = 'IDLE' | 'INVITED' | 'CONNECTING' | 'LIVE';

interface WhisperPanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
    whisperBadge: number;
    /** Called when user taps CONNECT — sends whisper invite */
    onSendInvite: () => void;
    /** Set to true when partner has accepted the invite */
    partnerAccepted: boolean;
    /** 'idle' for sender (default), 'accepted' for receiver who accepted invite */
    initialState?: 'idle' | 'accepted';
}

/* ═══════════════════════ COMPONENT ════════════════════════ */

export default function WhisperPanel({
    visible, onClose, socket, roomId, whisperBadge,
    onSendInvite, partnerAccepted, initialState = 'idle',
}: WhisperPanelProps) {
    const slideAnim = useRef(new RNAnimated.Value(400)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;

    const [state, setState] = useState<WhisperState>('IDLE');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [partnerSpeaking, setPartnerSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pcRef = useRef<any>(null);
    const localStreamRef = useRef<any>(null);
    const isCaller = useRef(false);
    const partnerReady = useRef(false);
    const cleanedUp = useRef(false);
    const makingOffer = useRef(false);
    const webrtcStarted = useRef(false);

    /* ── reset when panel opens ── */
    useEffect(() => {
        if (visible) {
            cleanedUp.current = false;
            webrtcStarted.current = false;
            partnerReady.current = false;
            isCaller.current = false;
            makingOffer.current = false;
            setError(null);
            setIsSpeaking(false);
            setPartnerSpeaking(false);

            if (initialState === 'accepted') {
                setState('CONNECTING');
            } else {
                setState('IDLE');
            }
        }
    }, [visible, initialState]);

    /* ── slide animation ── */
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

    /* ── create peer connection ── */
    const createPC = useCallback((): any | null => {
        const PC = Platform.OS === 'web'
            ? (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection
            : NativeRTCPC;
        if (!PC) { setError('WebRTC not available on this device.'); return null; }
        try { return new PC({ iceServers: ICE_SERVERS }); }
        catch (e: any) { setError(`PeerConnection failed: ${e?.message}`); return null; }
    }, []);

    /* ── acquire audio-only stream (starts muted for PTT) ── */
    const acquireAudio = useCallback(async (): Promise<any | null> => {
        try {
            if (Platform.OS === 'web') {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                stream.getAudioTracks().forEach(t => { t.enabled = false; });
                return stream;
            }

            if (Platform.OS === 'android') {
                const mic = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    { title: 'Microphone', message: 'Piqabu needs mic access for Whisper', buttonPositive: 'Allow' },
                );
                if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
                    setError('Microphone permission denied.');
                    return null;
                }
            }

            if (nativeMediaDevices) {
                const stream = await nativeMediaDevices.getUserMedia({ audio: true, video: false } as any);
                const tracks = stream.getAudioTracks?.() ?? [];
                tracks.forEach((t: any) => { t.enabled = false; });
                return stream;
            }
            throw new Error('Media devices not available.');
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            if (msg.includes('Permission') || msg.includes('denied')) {
                setError('Microphone permission denied. Please allow in Settings.');
            } else {
                setError(`Mic error: ${msg}`);
            }
            return null;
        }
    }, []);

    /* ── SDP / ICE helpers ── */
    const wrapSDP = useCallback((p: any) => {
        if (Platform.OS === 'web') { const S = (window as any).RTCSessionDescription; return S ? new S(p) : p; }
        return NativeRTCSD ? new NativeRTCSD(p) : p;
    }, []);
    const wrapICE = useCallback((p: any) => {
        if (Platform.OS === 'web') { const I = (window as any).RTCIceCandidate; return I ? new I(p) : p; }
        return NativeRTCIC ? new NativeRTCIC(p) : p;
    }, []);
    const serSDP = useCallback((d: any) => {
        if (!d) return d;
        return Platform.OS !== 'web' ? { type: d.type, sdp: d.sdp } : d;
    }, []);
    const serICE = useCallback((c: any) => {
        if (!c) return c;
        return Platform.OS !== 'web' ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } : c;
    }, []);

    /* ── create & send offer ── */
    const createOffer = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !socket) return;
        try {
            makingOffer.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('whisper_signal', {
                roomId,
                signal: { type: 'offer', payload: serSDP(pc.localDescription) },
            });
        } catch (e: any) {
            console.warn('[Whisper] createOffer failed:', e?.message);
            setError('Failed to initiate audio connection.');
        } finally {
            makingOffer.current = false;
        }
    }, [roomId, socket, serSDP]);

    /* ── handle incoming signaling ── */
    const handleSignal = useCallback(async (data: {
        roomId: string;
        signal: { type: string; payload: any };
    }) => {
        const pc = pcRef.current;
        if (!pc || data.roomId !== roomId) return;
        const { type, payload } = data.signal;
        try {
            if (type === 'offer') {
                if (makingOffer.current || pc.signalingState !== 'stable') {
                    if (isCaller.current) return;
                    await pc.setLocalDescription({ type: 'rollback' });
                }
                await pc.setRemoteDescription(wrapSDP(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket?.emit('whisper_signal', {
                    roomId,
                    signal: { type: 'answer', payload: serSDP(pc.localDescription) },
                });
            } else if (type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(wrapSDP(payload));
                }
            } else if (type === 'candidate' && payload) {
                await pc.addIceCandidate(wrapICE(payload));
            }
        } catch (e: any) {
            console.warn('[Whisper] signal error:', e?.message);
        }
    }, [roomId, socket, wrapSDP, wrapICE, serSDP]);

    /* ── start WebRTC audio connection ── */
    const startWebRTC = useCallback(async () => {
        if (webrtcStarted.current) return;
        webrtcStarted.current = true;
        setState('CONNECTING');

        const stream = await acquireAudio();
        if (!stream) return;
        localStreamRef.current = stream;

        if (!socket) { setError('No socket connection.'); return; }

        const pc = createPC();
        if (!pc) return;
        pcRef.current = pc;

        // Add audio tracks
        const tracks: any[] = stream.getTracks?.() ?? [];
        tracks.forEach((t: any) => {
            try { pc.addTrack(t, stream); } catch {}
        });

        // ICE candidates
        pc.onicecandidate = (e: any) => {
            if (e.candidate && socket) {
                socket.emit('whisper_signal', {
                    roomId,
                    signal: { type: 'candidate', payload: serICE(e.candidate) },
                });
            }
        };

        // Connection state
        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            if (s === 'connected') setState('LIVE');
            else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
                setError('Audio connection lost.');
            }
        };
        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            if (s === 'connected' || s === 'completed') setState('LIVE');
            else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
                setError('Audio connection lost.');
            }
        };

        // Attach signaling listeners
        socket.off('whisper_signal');
        socket.off('whisper_ready');
        socket.on('whisper_signal', handleSignal);
        socket.on('whisper_ready', (data: any) => {
            if (!partnerReady.current) {
                partnerReady.current = true;
                const from = data?.from;
                if (from && socket.id) {
                    // Deterministic caller: smaller socket.id creates the offer
                    if (socket.id < from) {
                        isCaller.current = true;
                        createOffer();
                    }
                    // else: wait for the other peer's offer
                } else {
                    // Fallback (server not redeployed): first to receive = caller
                    isCaller.current = true;
                    createOffer();
                }
            }
        });

        // Announce ready
        socket.emit('whisper_ready', { roomId });
    }, [socket, roomId, acquireAudio, createPC, handleSignal, createOffer, serICE]);

    /* ── listen for partner PTT ── */
    useEffect(() => {
        if (!socket || !roomId) return;
        const handlePTT = (data: { roomId: string; speaking: boolean }) => {
            if (data.roomId === roomId) setPartnerSpeaking(data.speaking);
        };
        socket.on('whisper_ptt', handlePTT);
        return () => { socket.off('whisper_ptt', handlePTT); };
    }, [socket, roomId]);

    /* ── trigger WebRTC when state enters CONNECTING ── */
    useEffect(() => {
        if (state === 'CONNECTING' && visible) {
            startWebRTC();
        }
    }, [state, visible, startWebRTC]);

    /* ── when partner accepts invite → connect ── */
    useEffect(() => {
        if (partnerAccepted && state === 'INVITED' && visible) {
            setState('CONNECTING');
        }
    }, [partnerAccepted, state, visible]);

    /* ── cleanup ── */
    const cleanup = useCallback(() => {
        if (cleanedUp.current) return;
        cleanedUp.current = true;

        if (pcRef.current) {
            try {
                pcRef.current.ontrack = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
            } catch {}
            pcRef.current = null;
        }

        if (localStreamRef.current) {
            try {
                const tracks = localStreamRef.current.getTracks?.() ?? [];
                tracks.forEach((t: any) => { try { t.stop(); } catch {} });
            } catch {}
            localStreamRef.current = null;
        }

        if (socket) {
            socket.off('whisper_signal');
            socket.off('whisper_ready');
        }

        setState('IDLE');
        setIsSpeaking(false);
        setPartnerSpeaking(false);
        setError(null);
        partnerReady.current = false;
        isCaller.current = false;
        makingOffer.current = false;
        webrtcStarted.current = false;
    }, [socket]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pcRef.current) {
                try { pcRef.current.close(); } catch {}
                pcRef.current = null;
            }
            if (localStreamRef.current) {
                try {
                    const tracks = localStreamRef.current.getTracks?.() ?? [];
                    tracks.forEach((t: any) => { try { t.stop(); } catch {} });
                } catch {}
                localStreamRef.current = null;
            }
        };
    }, []);

    const handleClose = useCallback(() => {
        cleanup();
        onClose();
    }, [cleanup, onClose]);

    /* ── PTT handlers ── */
    const handlePTTIn = useCallback(() => {
        if (state !== 'LIVE') return;
        const stream = localStreamRef.current;
        if (stream) {
            const tracks = stream.getAudioTracks?.() ?? [];
            tracks.forEach((t: any) => { t.enabled = true; });
        }
        setIsSpeaking(true);
        socket?.emit('whisper_ptt', { roomId, speaking: true });
    }, [state, socket, roomId]);

    const handlePTTOut = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            const tracks = stream.getAudioTracks?.() ?? [];
            tracks.forEach((t: any) => { t.enabled = false; });
        }
        setIsSpeaking(false);
        socket?.emit('whisper_ptt', { roomId, speaking: false });
    }, [socket, roomId]);

    /* ── CONNECT button ── */
    const handleConnect = useCallback(() => {
        setState('INVITED');
        onSendInvite();
    }, [onSendInvite]);

    if (!visible) return null;

    /* ── derived values ── */
    const statusColor = state === 'LIVE' ? '#4ADE80' : error ? '#EF4444' : THEME.faint;
    const pttLabel = isSpeaking ? 'SPEAKING' : partnerSpeaking ? 'LISTENING...' : 'HOLD TO SPEAK';
    const statusLabel = state === 'LIVE' ? 'LIVE'
        : state === 'CONNECTING' ? 'ESTABLISHING LINE...'
        : state === 'INVITED' ? 'CALLING...'
        : 'PUSH TO TALK \u2022 NO RECORDING';

    /* ═══════════════════ RENDER ═══════════════════ */

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Backdrop */}
            <RNAnimated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
            </RNAnimated.View>

            {/* Card */}
            <RNAnimated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <View style={styles.headerRow}>
                            <View style={[styles.liveDot, { backgroundColor: statusColor }]} />
                            <Text style={styles.headerTitle}>WHISPER</Text>
                        </View>
                        <Text style={styles.headerSub}>{statusLabel}</Text>
                    </View>
                    <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.body}>
                    {/* Error */}
                    {error && (
                        <View style={styles.errorBanner}>
                            <Ionicons name="warning-outline" size={14} color="#EF4444" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* IDLE: connect button */}
                    {state === 'IDLE' && !error && (
                        <TouchableOpacity onPress={handleConnect} style={styles.connectBtn} activeOpacity={0.7}>
                            <Ionicons name="radio-outline" size={28} color="#000" />
                            <Text style={styles.connectBtnText}>CONNECT</Text>
                        </TouchableOpacity>
                    )}

                    {/* INVITED: waiting */}
                    {state === 'INVITED' && (
                        <View style={styles.waitingBox}>
                            <Ionicons name="radio" size={24} color={THEME.faint} />
                            <Text style={styles.waitingText}>WAITING FOR PARTNER...</Text>
                        </View>
                    )}

                    {/* CONNECTING */}
                    {state === 'CONNECTING' && (
                        <View style={styles.waitingBox}>
                            <Ionicons name="pulse-outline" size={24} color={THEME.faint} />
                            <Text style={styles.waitingText}>ESTABLISHING LINE...</Text>
                        </View>
                    )}

                    {/* LIVE: PTT */}
                    {state === 'LIVE' && (
                        <>
                            {partnerSpeaking && (
                                <View style={styles.partnerRow}>
                                    <View style={styles.partnerDot} />
                                    <Text style={styles.partnerText}>PARTNER SPEAKING</Text>
                                </View>
                            )}

                            <Pressable
                                onPressIn={handlePTTIn}
                                onPressOut={handlePTTOut}
                                style={({ pressed }) => [
                                    styles.pttBtn,
                                    (isSpeaking || pressed) && styles.pttBtnActive,
                                ]}
                            >
                                <Ionicons
                                    name={isSpeaking ? 'mic' : 'mic-outline'}
                                    size={32}
                                    color={isSpeaking ? '#000' : THEME.muted}
                                />
                                <Text style={[styles.pttLabel, isSpeaking && styles.pttLabelActive]}>
                                    {pttLabel}
                                </Text>
                            </Pressable>
                        </>
                    )}

                    {/* Wave bar */}
                    <View style={styles.waveBar}>
                        {state === 'LIVE' ? (
                            <Text style={styles.waveText}>
                                {isSpeaking ? 'TRANSMITTING...' : partnerSpeaking ? 'RECEIVING...' : 'LINE OPEN'}
                            </Text>
                        ) : whisperBadge > 0 ? (
                            <Text style={styles.waveText}>INCOMING TRANSMISSION...</Text>
                        ) : (
                            <View style={styles.waveDots}>
                                {[0.1, 0.35, 0.65, 0.9].map((pos, i) => (
                                    <View key={i} style={[styles.waveDot, { left: `${pos * 100}%` }]} />
                                ))}
                            </View>
                        )}
                    </View>

                    <Text style={styles.footer}>PUSH TO TALK {'\u2022'} NO RECORDING {'\u2022'} NO HISTORY</Text>
                </View>
            </RNAnimated.View>
        </View>
    );
}

/* ═══════════════════════ STYLES ══════════════════════════ */

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
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
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
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        borderRadius: 10,
        padding: 10,
    },
    errorText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: '#EF4444',
        flex: 1,
    },
    connectBtn: {
        width: '100%',
        height: 140,
        borderRadius: 26,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    connectBtnText: {
        fontFamily: THEME.mono,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2.2,
        color: '#000',
        textTransform: 'uppercase',
    },
    waitingBox: {
        width: '100%',
        height: 140,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.22)',
        backgroundColor: 'rgba(0,0,0,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    waitingText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        fontWeight: '900',
        color: THEME.faint,
        textTransform: 'uppercase',
    },
    partnerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    partnerDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: THEME.accEmerald,
    },
    partnerText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        fontWeight: '900',
        color: THEME.accEmerald,
        textTransform: 'uppercase',
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
        backgroundColor: THEME.accEmerald,
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
        color: '#000',
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
