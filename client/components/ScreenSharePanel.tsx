/**
 * ScreenSharePanel
 *
 * One-way screen mirroring between two peers (Live Mirror).
 * Sharer captures their screen via Android's MediaProjection
 * (getDisplayMedia); viewer renders the incoming track full-screen.
 *
 * The WebRTC plumbing here is a deliberate mirror of LiveGlassPanel:
 *   - deterministic readiness exchange (screen_share_ready)
 *   - perfect-negotiation pattern with rollback
 *   - both `ontrack` AND `onaddstream` (Android react-native-webrtc
 *     still fires the legacy onaddstream on some devices)
 *   - explicit SDP / ICE serialisation (flat JSON, no class instances
 *     across the wire)
 *
 * The earlier implementation diverged from LiveGlass and produced an
 * "ICE connected but no frames" symptom. The fix is to align with the
 * proven path.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, Platform, AppState, AppStateStatus, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import { useSecurity } from '../contexts/SecurityContext';
import { fetchIceServers } from '../lib/iceServers';
import type { Socket } from 'socket.io-client';

/* ─────────────────────────── platform-specific WebRTC ────────────────────── */

let RNWebRTC: any = null;
if (Platform.OS !== 'web') {
    try {
        RNWebRTC = require('react-native-webrtc');
        console.log('[ScreenShare] react-native-webrtc loaded OK');
    } catch (e) {
        console.warn('[ScreenShare] react-native-webrtc FAILED to load:', e);
    }
}

const NativeRTCPeerConnection: any = RNWebRTC?.RTCPeerConnection;
const NativeRTCSessionDescription: any = RNWebRTC?.RTCSessionDescription;
const NativeRTCIceCandidate: any = RNWebRTC?.RTCIceCandidate;
const nativeMediaDevices: any = RNWebRTC?.mediaDevices;
const RTCViewNative: React.ComponentType<any> | undefined = RNWebRTC?.RTCView;

/* ──────────────────────────────── props ──────────────────────────────────── */

interface ScreenSharePanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
    /** true = this user captures + sends; false = this user receives + renders */
    isSharer: boolean;
    minimized?: boolean;
    onMinimize?: () => void;
    onMaximize?: () => void;
}

type Status = 'idle' | 'preparing' | 'connecting' | 'active' | 'error' | 'unsupported' | 'ended';

/* ═══════════════════════════════ COMPONENT ═══════════════════════════════ */

export default function ScreenSharePanel({
    visible, onClose, socket, roomId, isSharer,
    minimized, onMinimize, onMaximize,
}: ScreenSharePanelProps) {
    /* ── state ────────────────────────────────────────────────────────── */
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [nativeStreamURL, setNativeStreamURL] = useState<string | null>(null);
    const [remoteStream, setRemoteStream] = useState<any>(null);

    /* ── refs ─────────────────────────────────────────────────────────── */
    const pcRef = useRef<any>(null);
    const localStreamRef = useRef<any>(null);
    const partnerReady = useRef(false);
    const cleanedUp = useRef(false);
    const makingOffer = useRef(false);
    const negotiationStarted = useRef(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    /* ── biometric bypass while sharing ──────────────────────────────── */
    const { setScreenShareActive, setFilePickerActive } = useSecurity();

    /* ────────── helper: build RTCPeerConnection with TURN ───────────── */

    const createPeerConnection = useCallback(async (): Promise<any | null> => {
        const PC = Platform.OS === 'web'
            ? (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection
            : NativeRTCPeerConnection;

        if (!PC) {
            setError('RTCPeerConnection is not available on this platform.');
            setStatus('unsupported');
            return null;
        }

        try {
            const iceServers = await fetchIceServers();
            console.log('[ScreenShare] ICE servers:', iceServers.length, 'configured');
            return new PC({ iceServers });
        } catch (err: any) {
            setError(`Failed to create peer connection: ${err?.message ?? err}`);
            setStatus('error');
            return null;
        }
    }, []);

    /* ────────── helper: serialise / wrap descriptions ───────────────── */

    const wrapSD = useCallback((payload: any): any => {
        if (Platform.OS === 'web') {
            const SD = (window as any).RTCSessionDescription;
            return SD ? new SD(payload) : payload;
        }
        return NativeRTCSessionDescription ? new NativeRTCSessionDescription(payload) : payload;
    }, []);

    const wrapICE = useCallback((payload: any): any => {
        if (Platform.OS === 'web') {
            const IC = (window as any).RTCIceCandidate;
            return IC ? new IC(payload) : payload;
        }
        return NativeRTCIceCandidate ? new NativeRTCIceCandidate(payload) : payload;
    }, []);

    const serialiseSD = useCallback((desc: any): any => {
        if (!desc) return desc;
        if (Platform.OS !== 'web') {
            return { type: desc.type, sdp: desc.sdp };
        }
        return desc;
    }, []);

    const serialiseICE = useCallback((candidate: any): any => {
        if (!candidate) return candidate;
        if (Platform.OS !== 'web') {
            return {
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex,
            };
        }
        return candidate;
    }, []);

    /* ────────── acquire screen capture stream (sharer only) ─────────── */

    const acquireScreen = useCallback(async (): Promise<any | null> => {
        try {
            if (Platform.OS === 'web') {
                if (!navigator.mediaDevices?.getDisplayMedia) {
                    setError('Screen sharing is not supported in this browser.');
                    setStatus('unsupported');
                    return null;
                }
                return await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false,
                });
            }

            if (!nativeMediaDevices?.getDisplayMedia) {
                setError('Screen capture not available. Please use the latest APK build.');
                setStatus('unsupported');
                return null;
            }

            // Bypass biometric lock during the MediaProjection dialog
            setFilePickerActive(true);
            const stream = await nativeMediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            setFilePickerActive(false);

            console.log('[ScreenShare] Screen stream acquired, tracks:', stream?.getTracks?.()?.length);
            return stream;
        } catch (err: any) {
            setFilePickerActive(false);
            const msg = err?.message ?? String(err);
            console.warn('[ScreenShare] getDisplayMedia failed:', msg);

            if (msg.includes('permission') || msg.includes('denied') || msg.includes('cancel') || msg.includes('NotAllowed')) {
                setError('Screen capture was cancelled. Tap Retry and choose "Start now" when prompted.');
            } else {
                setError(`Screen capture failed: ${msg}`);
            }
            setStatus('error');
            return null;
        }
    }, [setFilePickerActive]);

    /* ────────────────────────── cleanup ─────────────────────────────── */

    const cleanup = useCallback(() => {
        if (cleanedUp.current) return;
        cleanedUp.current = true;

        // Sharer notifies the viewer so they don't stare at a frozen frame.
        // Best-effort — fine to no-op if the socket is already gone.
        if (socket && isSharer) {
            try { socket.emit('screen_share_ended', { roomId }); } catch { }
        }

        // Detach socket listeners
        if (socket) {
            socket.off('screen_share_signal');
            socket.off('screen_share_ready');
            socket.off('screen_share_ended');
            socket.off('transmit_screen_share_controls');
        }

        // Close peer connection
        if (pcRef.current) {
            try {
                pcRef.current.ontrack = null;
                pcRef.current.onaddstream = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
            } catch { }
            pcRef.current = null;
        }

        // Stop local tracks (sharer)
        if (localStreamRef.current) {
            try {
                localStreamRef.current.getTracks?.().forEach((t: any) => {
                    try { t.stop(); } catch { }
                });
            } catch { }
            localStreamRef.current = null;
        }

        // Detach web video element
        if (Platform.OS === 'web' && videoRef.current) {
            try { videoRef.current.srcObject = null; } catch { }
        }

        setStatus('idle');
        setError(null);
        setNativeStreamURL(null);
        setRemoteStream(null);
        partnerReady.current = false;
        makingOffer.current = false;
        negotiationStarted.current = false;
    }, [socket, isSharer, roomId]);

    /* ────────── create + send an offer (sharer only) ─────────────────── */

    const createOffer = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !socket) return;
        if (negotiationStarted.current) return; // one offer per session
        negotiationStarted.current = true;

        try {
            makingOffer.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('screen_share_signal', {
                roomId,
                signal: {
                    type: 'offer' as const,
                    payload: serialiseSD(pc.localDescription),
                },
            });
            console.log('[ScreenShare] Offer sent');
        } catch (err: any) {
            console.warn('[ScreenShare] createOffer failed:', err?.message ?? err);
            setError('Failed to start screen share. Please try again.');
            setStatus('error');
        } finally {
            makingOffer.current = false;
        }
    }, [roomId, socket, serialiseSD]);

    /* ─────────────── handle incoming signaling messages ─────────────── */

    const handleSignal = useCallback(async (data: any) => {
        const pc = pcRef.current;
        if (!pc || data.roomId !== roomId) return;

        // Tolerate both new (signal:{}) and legacy (flat) payload shapes
        let type: string;
        let payload: any;
        if (data.signal && typeof data.signal.type === 'string') {
            type = data.signal.type;
            payload = data.signal.payload;
        } else if (typeof data.type === 'string') {
            type = data.type;
            if (type === 'offer' || type === 'answer') {
                payload = { type, sdp: data.sdp };
            } else if (type === 'candidate' || type === 'ice-candidate') {
                type = 'candidate';
                payload = data.candidate;
            } else {
                return;
            }
        } else {
            return;
        }

        try {
            if (type === 'offer') {
                // Perfect-negotiation rollback: only the sharer should ever
                // receive a glare offer. The viewer never makes one.
                if (makingOffer.current || pc.signalingState !== 'stable') {
                    if (isSharer) return; // sharer ignores incoming offer
                    try { await pc.setLocalDescription({ type: 'rollback' } as any); } catch { }
                }

                await pc.setRemoteDescription(wrapSD(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket?.emit('screen_share_signal', {
                    roomId,
                    signal: {
                        type: 'answer' as const,
                        payload: serialiseSD(pc.localDescription),
                    },
                });
                console.log('[ScreenShare] Answer sent');
            } else if (type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(wrapSD(payload));
                    console.log('[ScreenShare] Remote answer applied');
                }
            } else if (type === 'candidate') {
                if (payload) {
                    try {
                        await pc.addIceCandidate(wrapICE(payload));
                    } catch (e: any) {
                        // Some browsers fail with end-of-candidates markers; ignore
                        console.log('[ScreenShare] addIceCandidate skipped:', e?.message);
                    }
                }
            }
        } catch (err: any) {
            console.warn('[ScreenShare] signal handling error:', err?.message ?? err);
        }
    }, [roomId, isSharer, socket, wrapSD, wrapICE, serialiseSD]);

    /* ─────────── attach the common pc handlers (both sides) ──────────── */

    const attachPCHandlers = useCallback((pc: any) => {
        pc.onicecandidate = (event: any) => {
            if (event.candidate && socket) {
                socket.emit('screen_share_signal', {
                    roomId,
                    signal: {
                        type: 'candidate' as const,
                        payload: serialiseICE(event.candidate),
                    },
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const ice = pc.iceConnectionState;
            console.log('[ScreenShare] ICE state:', ice);
            if (ice === 'connected' || ice === 'completed') {
                setStatus('active');
            } else if (ice === 'failed') {
                setError('Connection failed. A relay server may be needed if both devices are on different networks.');
                setStatus('error');
            } else if (ice === 'disconnected') {
                // Often transient — don't surface as error immediately
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[ScreenShare] Connection state:', pc.connectionState);
        };

        // Viewer: render incoming track. Wire BOTH ontrack and onaddstream
        // because react-native-webrtc on Android fires the legacy callback
        // for some codec paths.
        if (!isSharer) {
            pc.ontrack = (event: any) => {
                console.log('[ScreenShare] ontrack fired, kind:', event.track?.kind);
                const stream = event.streams?.[0];
                if (!stream) return;
                setRemoteStream(stream);
                if (Platform.OS !== 'web') {
                    const url = stream.toURL?.();
                    if (url) setNativeStreamURL(url);
                } else if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            };

            if (Platform.OS !== 'web') {
                pc.onaddstream = (event: any) => {
                    console.log('[ScreenShare] onaddstream fired (legacy fallback)');
                    if (event.stream) {
                        setRemoteStream(event.stream);
                        const url = event.stream.toURL?.();
                        if (url) setNativeStreamURL(url);
                    }
                };
            }
        }
    }, [socket, roomId, isSharer, serialiseICE]);

    /* ─────────────── start (both sides) on visibility ─────────────────── */

    useEffect(() => {
        if (!visible || !socket || !roomId) return;

        cleanedUp.current = false;
        let cancelled = false;

        const start = async () => {
            setStatus('preparing');
            setError(null);

            // Sharer: capture screen FIRST so the offer's SDP includes the
            // video m-line.
            let stream: any = null;
            if (isSharer) {
                stream = await acquireScreen();
                if (!stream || cancelled) return;
                if (stream.getTracks?.().length === 0) {
                    setError('No screen capture stream produced. Please retry.');
                    setStatus('error');
                    return;
                }
                localStreamRef.current = stream;

                // The OS notification "Stop sharing" ends the track —
                // tear down the session in that case.
                stream.getVideoTracks?.().forEach((t: any) => {
                    t.addEventListener?.('ended', () => {
                        if (!cleanedUp.current) {
                            cleanup();
                            onClose();
                        }
                    });
                });
            }

            // Build pc
            const pc = await createPeerConnection();
            if (!pc || cancelled) return;
            pcRef.current = pc;

            // Sharer adds its tracks BEFORE attaching listeners / sending offer
            if (isSharer && stream) {
                stream.getTracks().forEach((t: any) => {
                    try { pc.addTrack(t, stream); } catch (e: any) {
                        console.warn('[ScreenShare] addTrack error:', e?.message);
                    }
                });
            }

            attachPCHandlers(pc);

            setStatus('connecting');

            // Attach signal handler
            socket.off('screen_share_signal');
            socket.on('screen_share_signal', handleSignal);

            // Readiness exchange — sharer waits for viewer's ready, then offers.
            //
            // We ECHO ready on receipt because the sharer's getDisplayMedia
            // dialog takes 1-3s on Android, so the viewer's initial ready
            // emit can arrive before the sharer's listener is attached.
            // The echo guarantees both sides eventually hear each other.
            // The partnerReady guard caps the chain at 1 echo per side.
            socket.off('screen_share_ready');
            socket.on('screen_share_ready', () => {
                if (partnerReady.current) return;
                partnerReady.current = true;
                console.log('[ScreenShare] Partner ready');
                // Echo back in case our own first ready was missed.
                try { socket.emit('screen_share_ready', { roomId }); } catch { }
                if (isSharer) {
                    // Viewer just confirmed it's listening — safe to offer
                    createOffer();
                }
            });

            // Viewer-only: listen for sharer ending the session so we can
            // surface "PARTNER STOPPED SHARING" instead of a frozen frame.
            if (!isSharer) {
                socket.off('screen_share_ended');
                socket.on('screen_share_ended', (data: any) => {
                    if (data?.roomId !== roomId) return;
                    console.log('[ScreenShare] Sharer ended session');
                    setStatus('ended');
                });
            }

            // Tell the other side we're set up
            socket.emit('screen_share_ready', { roomId });
            console.log('[ScreenShare] Local ready emitted');
        };

        start();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, isSharer, roomId, socket]);

    /* ─────────────── cleanup on close / unmount ──────────────────────── */

    useEffect(() => {
        if (!visible) {
            cleanup();
        }
        return () => cleanup();
    }, [visible, cleanup]);

    /* ─────────── biometric bypass while sharing (sharer only) ────────── */

    useEffect(() => {
        if (visible && isSharer) setScreenShareActive(true);
        return () => { if (isSharer) setScreenShareActive(false); };
    }, [visible, isSharer, setScreenShareActive]);

    /* ─────────── connecting timeout — surface retry after 12s ───────── */

    useEffect(() => {
        if (status !== 'connecting') return;
        const t = setTimeout(() => {
            setError('Connection timed out. Tap Retry — your correspondent may need to relaunch the app.');
            setStatus('error');
        }, 12000);
        // The cleanup auto-clears the timeout when status leaves 'connecting'
        // (e.g. transitions to 'active'), so the error only fires if we're
        // still stuck after 12 seconds.
        return () => clearTimeout(t);
    }, [status]);

    /* ─────────── auto-minimize sharer once active ────────────────────── */

    useEffect(() => {
        if (status === 'active' && isSharer && onMinimize && !minimized) {
            const t = setTimeout(() => {
                // Collapse the in-app panel to a pill so the room is ready
                // to come back to.
                onMinimize();
                // Then background the Piqabu app entirely. Without this the
                // screen being captured IS Piqabu's own UI — a recursive
                // loop that often shows up as "nothing streams" on the
                // receiver. MediaProjection's foreground service keeps the
                // native capture alive across the background transition.
                if (Platform.OS === 'android') {
                    try { BackHandler.exitApp(); } catch { /* noop */ }
                }
            }, 1500);
            return () => clearTimeout(t);
        }
    }, [status, isSharer, onMinimize, minimized]);

    /* ─────────── keep-alive when app returns from background ────────── */

    useEffect(() => {
        if (!visible || !isSharer) return;
        const handle = (next: AppStateStatus) => {
            if (next === 'active' && status === 'active') {
                setScreenShareActive(true);
            }
        };
        const sub = AppState.addEventListener('change', handle);
        return () => sub.remove();
    }, [visible, isSharer, status, setScreenShareActive]);

    /* ─────────── attach <video> element on web (viewer) ──────────────── */

    useEffect(() => {
        if (Platform.OS !== 'web' || isSharer || !visible) return;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = '#000';

        videoRef.current = video;
        if (remoteStream) video.srcObject = remoteStream;

        const containerId = '__screen_share_video_container__';
        const tryAttach = () => {
            const c = document.getElementById(containerId);
            if (c) { c.innerHTML = ''; c.appendChild(video); }
            else setTimeout(tryAttach, 100);
        };
        tryAttach();

        return () => {
            try { video.parentNode?.removeChild(video); } catch { }
            video.srcObject = null;
            videoRef.current = null;
        };
    }, [visible, isSharer, remoteStream]);

    /* ─────────────────────────── handlers ────────────────────────────── */

    const handleStop = useCallback(() => {
        cleanup();
        onClose();
    }, [cleanup, onClose]);

    const handleRetry = useCallback(() => {
        cleanup();
        // The visibility-driven effect will re-run start()
        cleanedUp.current = false;
        setStatus('idle');
        setError(null);
    }, [cleanup]);

    /* ═══════════════════════════ RENDER ═══════════════════════════════ */

    if (!visible) return null;

    /* ── Minimized pill (sharer only) ─────────────────────────────────── */
    if (isSharer && minimized) {
        return (
            <TouchableOpacity onPress={onMaximize} style={styles.minimizedPill} activeOpacity={0.7}>
                <View style={styles.minimizedDot} />
                <Text style={styles.minimizedText}>SHARING</Text>
                <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); handleStop(); }}
                    style={styles.minimizedStop}
                    activeOpacity={0.7}
                >
                    <Ionicons name="stop" size={10} color={THEME.bad} />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    }

    /* ── Sharer view ──────────────────────────────────────────────────── */
    if (isSharer) {
        return (
            <Modal visible={visible} animationType="slide" transparent>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={[styles.liveDot, status === 'active' && styles.liveDotActive]} />
                            <Text style={styles.headerTitle}>SHARING SCREEN</Text>
                        </View>
                        <TouchableOpacity onPress={handleStop} style={styles.closeBtn} activeOpacity={0.7}>
                            <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={styles.sharerBody}>
                        {status === 'unsupported' ? (
                            <View style={styles.centered}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.faint} />
                                <Text style={styles.msgTitle}>NOT AVAILABLE</Text>
                                <Text style={styles.msgSub}>{error}</Text>
                            </View>
                        ) : status === 'error' ? (
                            <View style={styles.centered}>
                                <Ionicons name="warning-outline" size={48} color={THEME.faint} />
                                <Text style={styles.msgTitle}>ERROR</Text>
                                <Text style={styles.msgSub}>{error}</Text>
                                <TouchableOpacity onPress={handleRetry} style={styles.retryBtn} activeOpacity={0.7}>
                                    <Text style={styles.retryBtnText}>RETRY</Text>
                                </TouchableOpacity>
                            </View>
                        ) : status === 'preparing' ? (
                            <View style={styles.centered}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.muted} />
                                <Text style={styles.msgTitle}>STARTING CAPTURE</Text>
                                <Text style={styles.msgSub}>Tap "Start now" if prompted.</Text>
                            </View>
                        ) : status === 'connecting' ? (
                            <View style={styles.centered}>
                                <Ionicons name="sync-outline" size={48} color={THEME.muted} />
                                <Text style={styles.msgTitle}>CONNECTING...</Text>
                                <Text style={styles.msgSub}>Linking with your correspondent.</Text>
                            </View>
                        ) : (
                            <View style={styles.centered}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.live} />
                                <Text style={[styles.msgTitle, { color: THEME.live }]}>
                                    YOUR SCREEN IS{'\n'}BEING SHARED
                                </Text>
                                <Text style={styles.msgSub}>
                                    The panel will minimize. Your entire screen{'\n'}is visible to your correspondent.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Stop sharing */}
                    <TouchableOpacity onPress={handleStop} style={styles.endBtn} activeOpacity={0.7}>
                        <Ionicons name="stop-circle-outline" size={16} color={THEME.muted} style={{ marginRight: 8 }} />
                        <Text style={styles.endBtnText}>STOP SHARING</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    /* ── Viewer view ──────────────────────────────────────────────────── */
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Ionicons name="desktop-outline" size={14} color={THEME.muted} />
                        <Text style={styles.headerTitle}>SCREEN MIRROR</Text>
                    </View>
                    <TouchableOpacity onPress={handleStop} style={styles.closeBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.viewingLabel}>VIEWING CORRESPONDENT'S SCREEN</Text>

                {/* On-device debug strip — surfaces the viewer-side state
                    so we don't always need adb logcat to diagnose. Status,
                    whether the remote stream object arrived, whether the
                    stream URL was extracted, whether RTCView is wired. */}
                <Text style={styles.debugStrip}>
                    {`status=${status} | remoteStream=${!!remoteStream} | streamURL=${nativeStreamURL ? 'OK' : '-'} | RTCView=${!!RTCViewNative ? 'OK' : 'NO'}`}
                </Text>

                {/* Stream display */}
                <View style={styles.feedContainer}>
                    {status === 'ended' ? (
                        <View style={styles.noSignal}>
                            <Ionicons name="stop-circle-outline" size={36} color={THEME.muted} />
                            <Text style={[styles.noSignalText, { color: THEME.muted, fontSize: 11 }]}>
                                PARTNER STOPPED{'\n'}SHARING
                            </Text>
                            <TouchableOpacity onPress={handleStop} style={styles.retryBtn} activeOpacity={0.7}>
                                <Text style={styles.retryBtnText}>CLOSE</Text>
                            </TouchableOpacity>
                        </View>
                    ) : status === 'error' ? (
                        <View style={styles.noSignal}>
                            <Ionicons name="warning-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>{error}</Text>
                            <TouchableOpacity onPress={handleRetry} style={styles.retryBtn} activeOpacity={0.7}>
                                <Text style={styles.retryBtnText}>RETRY</Text>
                            </TouchableOpacity>
                        </View>
                    ) : status === 'preparing' || status === 'connecting' ? (
                        <View style={styles.noSignal}>
                            <Ionicons name="hourglass-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>WAITING FOR STREAM...</Text>
                        </View>
                    ) : Platform.OS === 'web' ? (
                        <View nativeID="__screen_share_video_container__" style={styles.webVideoContainer} />
                    ) : nativeStreamURL && RTCViewNative ? (
                        // Render the video plain. Two critical things vs
                        // the earlier broken version, both copied from
                        // LiveGlass's working remote-view render:
                        //   1. style with explicit width:100%/height:100%
                        //      — `flex: 1` does NOT measure correctly with
                        //      RTCView's SurfaceView and the surface
                        //      renders at 0x0, looking like a black square.
                        //   2. zOrder={0} — the full-screen remote case;
                        //      zOrder=1 is for PIP overlays.
                        <RTCViewNative
                            streamURL={nativeStreamURL}
                            style={{ width: '100%', height: '100%' }}
                            objectFit="contain"
                            zOrder={0}
                        />
                    ) : (
                        <View style={styles.noSignal}>
                            <Ionicons name="videocam-off-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>NO STREAM</Text>
                        </View>
                    )}
                </View>

                <TouchableOpacity onPress={handleStop} style={styles.endBtn} activeOpacity={0.7}>
                    <Text style={styles.endBtnText}>CLOSE</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

/* ═══════════════════════════════ STYLES ═══════════════════════════════════ */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: THEME.faint,
    },
    liveDotActive: {
        backgroundColor: '#fff',
        shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8,
    },
    headerTitle: {
        fontFamily: THEME.mono, fontSize: 11, letterSpacing: 2,
        color: '#fff', textTransform: 'uppercase', fontWeight: '900',
    },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },

    viewingLabel: {
        fontFamily: THEME.mono, fontSize: 9, letterSpacing: 2,
        color: THEME.faint, textTransform: 'uppercase', fontWeight: '900',
        marginBottom: 8,
    },

    sharerBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    centered: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
    msgTitle: {
        fontFamily: THEME.mono, fontSize: 14, letterSpacing: 3,
        color: THEME.muted, textTransform: 'uppercase', fontWeight: '900', textAlign: 'center',
    },
    msgSub: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 1,
        color: THEME.faint, textAlign: 'center', lineHeight: 16,
    },

    feedContainer: {
        flex: 1, borderRadius: 20, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#000',
        overflow: 'hidden', marginBottom: 12,
    },
    webVideoContainer: { flex: 1, backgroundColor: '#000' },
    nativeVideo: { flex: 1 },
    debugStrip: {
        fontFamily: THEME.mono,
        fontSize: 8,
        color: THEME.faint,
        letterSpacing: 0.6,
        paddingHorizontal: 14,
        paddingVertical: 4,
        textAlign: 'center',
    },
    noSignal: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
    noSignalText: {
        fontFamily: THEME.mono, fontSize: 10, color: THEME.faint,
        textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center', paddingHorizontal: 12,
    },

    controls: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    bnwBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    bnwBtnActive: { backgroundColor: '#fff' },
    blurControl: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    controlLabel: {
        fontFamily: THEME.mono, fontSize: 9, letterSpacing: 1.5,
        color: THEME.muted, textTransform: 'uppercase', fontWeight: '900',
    },
    slider: { flex: 1, height: 30 },
    controlValue: {
        fontFamily: THEME.mono, fontSize: 10, color: THEME.ink,
        fontWeight: '900', minWidth: 30, textAlign: 'right',
    },

    endBtn: {
        flexDirection: 'row', padding: 14, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: Platform.OS === 'ios' ? 20 : 10,
    },
    endBtnText: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900',
        letterSpacing: 2.2, color: THEME.muted, textTransform: 'uppercase',
    },

    retryBtn: {
        marginTop: 16, paddingVertical: 10, paddingHorizontal: 24,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    retryBtnText: {
        fontFamily: THEME.mono, fontSize: 10, fontWeight: '900',
        letterSpacing: 2, color: '#fff', textTransform: 'uppercase',
    },

    minimizedPill: {
        position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
        zIndex: 9998,
        shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8,
        elevation: 10,
    },
    minimizedDot: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff',
        shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6,
    },
    minimizedText: {
        fontFamily: THEME.mono, fontSize: 9, fontWeight: '900',
        letterSpacing: 2, color: '#fff', textTransform: 'uppercase',
    },
    minimizedStop: {
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    },
});
