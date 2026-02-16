import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import type { Socket } from 'socket.io-client';

/* ────────────────────────── platform-specific WebRTC imports ─────────────── */

let RNWebRTC: any = null;
if (Platform.OS !== 'web') {
    try {
        RNWebRTC = require('react-native-webrtc');
    } catch {}
}

const NativeRTCPeerConnection: typeof RTCPeerConnection | undefined =
    RNWebRTC?.RTCPeerConnection;
const NativeRTCSessionDescription: typeof RTCSessionDescription | undefined =
    RNWebRTC?.RTCSessionDescription;
const NativeRTCIceCandidate: typeof RTCIceCandidate | undefined =
    RNWebRTC?.RTCIceCandidate;
const nativeMediaDevices: typeof navigator.mediaDevices | undefined =
    RNWebRTC?.mediaDevices;
const RTCViewNative: React.ComponentType<any> | undefined = RNWebRTC?.RTCView;

/* ──────────────────────────── grayscale wrapper ──────────────────────────── */

let NativeGrayscale: any = null;
if (Platform.OS !== 'web') {
    try {
        NativeGrayscale =
            require('react-native-color-matrix-image-filters').Grayscale;
    } catch {}
}

function GrayscaleWrap({ children }: { children: React.ReactNode }) {
    if (Platform.OS === 'web') {
        return (
            <View style={{ filter: 'grayscale(100%)' } as any}>{children}</View>
        );
    }
    if (NativeGrayscale) return <NativeGrayscale>{children}</NativeGrayscale>;
    return <>{children}</>;
}

/* ─────────────────────────────── constants ───────────────────────────────── */

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'FAILED';

/* ───────────────── web-only <video> element component ────────────────────── */

function WebVideo({
    stream,
    muted = false,
    mirror = false,
    style,
}: {
    stream: MediaStream | null;
    muted?: boolean;
    mirror?: boolean;
    style?: React.CSSProperties;
}) {
    const ref = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (el) {
            el.srcObject = stream ?? null;
        }
    }, [stream]);

    if (Platform.OS !== 'web') return null;

    return (
        <video
            ref={ref as any}
            autoPlay
            playsInline
            muted={muted}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: mirror ? 'scaleX(-1)' : undefined,
                ...style,
            }}
        />
    );
}

/* ────────────────────────────── props type ───────────────────────────────── */

interface LiveGlassPanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
}

/* ═════════════════════════════ COMPONENT ══════════════════════════════════ */

export default function LiveGlassPanel({
    visible,
    onClose,
    socket,
    roomId,
}: LiveGlassPanelProps) {
    /* ── state ─────────────────────────────────────────────────────────── */
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStream, setRemoteStream] = useState<any>(null);
    const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
    const [blurIntensity, setBlurIntensity] = useState(0);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [facingFront, setFacingFront] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /* ── refs ──────────────────────────────────────────────────────────── */
    const pcRef = useRef<any>(null);
    const localStreamRef = useRef<any>(null);
    const isCaller = useRef(false);
    const partnerReady = useRef(false);
    const cleanedUp = useRef(false);
    const makingOffer = useRef(false);

    /* ────────────────── helper: build RTCPeerConnection ──────────────── */

    const createPeerConnection = useCallback((): any | null => {
        const PC =
            Platform.OS === 'web'
                ? (window as any).RTCPeerConnection ||
                  (window as any).webkitRTCPeerConnection
                : NativeRTCPeerConnection;

        if (!PC) {
            setError('RTCPeerConnection is not available on this platform.');
            return null;
        }

        try {
            return new PC({ iceServers: ICE_SERVERS });
        } catch (err: any) {
            setError(`Failed to create peer connection: ${err?.message ?? err}`);
            return null;
        }
    }, []);

    /* ────────────────── helper: acquire user media ───────────────────── */

    const acquireMedia = useCallback(
        async (useFrontCamera: boolean): Promise<any | null> => {
            const constraints: MediaStreamConstraints = {
                audio: true,
                video: {
                    facingMode: useFrontCamera ? 'user' : 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
            };

            try {
                if (Platform.OS === 'web') {
                    return await navigator.mediaDevices.getUserMedia(constraints);
                }
                if (nativeMediaDevices) {
                    return await nativeMediaDevices.getUserMedia(constraints as any);
                }
                throw new Error('Media devices API is not available.');
            } catch (err: any) {
                const msg = err?.message ?? String(err);
                if (
                    msg.includes('NotAllowedError') ||
                    msg.includes('Permission') ||
                    msg.includes('denied')
                ) {
                    setError(
                        'Camera / microphone permission denied. Please grant access in your device settings.',
                    );
                } else if (
                    msg.includes('NotFoundError') ||
                    msg.includes('DevicesNotFoundError') ||
                    msg.includes('not found')
                ) {
                    setError(
                        'No camera or microphone found. Ensure a media device is connected.',
                    );
                } else if (msg.includes('NotReadableError') || msg.includes('in use')) {
                    setError(
                        'Camera or microphone is already in use by another application.',
                    );
                } else {
                    setError(`Media error: ${msg}`);
                }
                return null;
            }
        },
        [],
    );

    /* ────────────────────────── cleanup ──────────────────────────────── */

    const cleanup = useCallback(() => {
        if (cleanedUp.current) return;
        cleanedUp.current = true;

        /* close peer connection */
        if (pcRef.current) {
            try {
                pcRef.current.ontrack = null;
                pcRef.current.onaddstream = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
            } catch {}
            pcRef.current = null;
        }

        /* stop all local tracks */
        if (localStreamRef.current) {
            try {
                const tracks =
                    localStreamRef.current.getTracks?.() ??
                    localStreamRef.current.getAudioTracks?.()?.concat(
                        localStreamRef.current.getVideoTracks?.() ?? [],
                    ) ??
                    [];
                tracks.forEach((t: any) => {
                    try {
                        t.stop();
                    } catch {}
                });
            } catch {}
            localStreamRef.current = null;
        }

        /* remove socket listeners */
        if (socket) {
            socket.off('webrtc_signal');
            socket.off('webrtc_ready');
        }

        /* reset state */
        setLocalStream(null);
        setRemoteStream(null);
        setStatus('CONNECTING');
        setBlurIntensity(0);
        setAudioEnabled(true);
        setFacingFront(true);
        setError(null);
        partnerReady.current = false;
        isCaller.current = false;
        makingOffer.current = false;
    }, [socket]);

    /* ─────────── helper: wrap SDP / ICE in platform-specific class ───── */

    const wrapSessionDescription = useCallback((payload: any): any => {
        if (Platform.OS === 'web') {
            const SD =
                (window as any).RTCSessionDescription ?? undefined;
            return SD ? new SD(payload) : payload;
        }
        return NativeRTCSessionDescription
            ? new NativeRTCSessionDescription(payload)
            : payload;
    }, []);

    const wrapIceCandidate = useCallback((payload: any): any => {
        if (Platform.OS === 'web') {
            const IC =
                (window as any).RTCIceCandidate ?? undefined;
            return IC ? new IC(payload) : payload;
        }
        return NativeRTCIceCandidate
            ? new NativeRTCIceCandidate(payload)
            : payload;
    }, []);

    /* ─────────── helper: serialise local description for signaling ───── */

    const serialiseDescription = useCallback((desc: any): any => {
        if (!desc) return desc;
        /* On native, RTCSessionDescription may not JSON-serialise cleanly */
        if (Platform.OS !== 'web') {
            return { type: desc.type, sdp: desc.sdp };
        }
        return desc;
    }, []);

    const serialiseCandidate = useCallback((candidate: any): any => {
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

    /* ──────────────────── create & send offer ───────────────────────── */

    const createOffer = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !socket) return;

        try {
            makingOffer.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('webrtc_signal', {
                roomId,
                signal: {
                    type: 'offer' as const,
                    payload: serialiseDescription(pc.localDescription),
                },
            });
        } catch (err: any) {
            console.warn('[LiveGlass] createOffer failed:', err?.message ?? err);
            setError('Failed to initiate the call. Please try again.');
        } finally {
            makingOffer.current = false;
        }
    }, [roomId, socket, serialiseDescription]);

    /* ──────────────── handle incoming signaling messages ─────────────── */

    const handleSignal = useCallback(
        async (data: {
            roomId: string;
            signal: { type: 'offer' | 'answer' | 'candidate'; payload: any };
        }) => {
            const pc = pcRef.current;
            if (!pc || data.roomId !== roomId) return;

            const { type, payload } = data.signal;

            try {
                if (type === 'offer') {
                    /*
                     * Glare resolution (perfect negotiation pattern):
                     * If we are also making an offer we need to decide who
                     * yields. The "polite" peer (non-caller) rolls back.
                     * The "impolite" peer (caller) ignores the incoming offer.
                     */
                    if (makingOffer.current || pc.signalingState !== 'stable') {
                        if (isCaller.current) {
                            /* Impolite — ignore the incoming offer */
                            return;
                        }
                        /* Polite — rollback our own description */
                        await pc.setLocalDescription({ type: 'rollback' });
                    }

                    await pc.setRemoteDescription(wrapSessionDescription(payload));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    socket?.emit('webrtc_signal', {
                        roomId,
                        signal: {
                            type: 'answer' as const,
                            payload: serialiseDescription(pc.localDescription),
                        },
                    });
                } else if (type === 'answer') {
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(
                            wrapSessionDescription(payload),
                        );
                    }
                } else if (type === 'candidate') {
                    if (payload) {
                        await pc.addIceCandidate(wrapIceCandidate(payload));
                    }
                }
            } catch (err: any) {
                console.warn(
                    '[LiveGlass] signal handling error:',
                    err?.message ?? err,
                );
            }
        },
        [
            roomId,
            socket,
            wrapSessionDescription,
            wrapIceCandidate,
            serialiseDescription,
        ],
    );

    /* ──────────────────── initialise the session ─────────────────────── */

    useEffect(() => {
        if (!visible) return;

        cleanedUp.current = false;
        let cancelled = false;

        const init = async () => {
            if (!socket) {
                setError('No socket connection available.');
                return;
            }

            /* 1 — acquire local media ---------------------------------- */
            const stream = await acquireMedia(true);
            if (!stream || cancelled) {
                return;
            }
            localStreamRef.current = stream;
            setLocalStream(stream);

            /* 2 — create peer connection ------------------------------- */
            const pc = createPeerConnection();
            if (!pc) return;
            pcRef.current = pc;

            /* 3 — add local tracks to the peer connection -------------- */
            const tracks: any[] = stream.getTracks?.() ?? [];
            tracks.forEach((track: any) => {
                try {
                    pc.addTrack(track, stream);
                } catch (e: any) {
                    console.warn('[LiveGlass] addTrack error:', e?.message);
                }
            });

            /* 4 — listen for remote tracks ----------------------------- */
            pc.ontrack = (event: any) => {
                if (event.streams?.[0]) {
                    setRemoteStream(event.streams[0]);
                }
            };
            /* react-native-webrtc also fires onaddstream */
            if (Platform.OS !== 'web') {
                pc.onaddstream = (event: any) => {
                    if (event.stream) {
                        setRemoteStream(event.stream);
                    }
                };
            }

            /* 5 — forward ICE candidates via signaling server ---------- */
            pc.onicecandidate = (event: any) => {
                if (event.candidate && socket) {
                    socket.emit('webrtc_signal', {
                        roomId,
                        signal: {
                            type: 'candidate' as const,
                            payload: serialiseCandidate(event.candidate),
                        },
                    });
                }
            };

            /* 6 — track connection state ------------------------------- */
            pc.onconnectionstatechange = () => {
                if (cancelled) return;
                const s = pc.connectionState;
                if (s === 'connected') {
                    setStatus('CONNECTED');
                } else if (
                    s === 'failed' ||
                    s === 'disconnected' ||
                    s === 'closed'
                ) {
                    setStatus('FAILED');
                } else {
                    setStatus('CONNECTING');
                }
            };

            pc.oniceconnectionstatechange = () => {
                if (cancelled) return;
                const ice = pc.iceConnectionState;
                if (ice === 'connected' || ice === 'completed') {
                    setStatus('CONNECTED');
                } else if (
                    ice === 'failed' ||
                    ice === 'disconnected' ||
                    ice === 'closed'
                ) {
                    setStatus('FAILED');
                }
            };

            /* 7 — attach socket listeners ------------------------------ */
            socket.off('webrtc_signal');
            socket.off('webrtc_ready');

            socket.on('webrtc_signal', handleSignal);

            socket.on('webrtc_ready', () => {
                /*
                 * Both peers emit `webrtc_ready` upon opening.
                 * The first one to **receive** the partner's ready
                 * becomes the caller (creates the offer).
                 */
                if (!partnerReady.current) {
                    partnerReady.current = true;
                    isCaller.current = true;
                    createOffer();
                }
            });

            /* 8 — announce that we are ready --------------------------- */
            socket.emit('webrtc_ready', { roomId });
        };

        init();

        return () => {
            cancelled = true;
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, socket, roomId]);

    /* ──────────────────── audio mute toggle ──────────────────────────── */

    const toggleAudio = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;

        const audioTracks = stream.getAudioTracks?.() ?? [];
        const track = audioTracks[0];
        if (track) {
            const next = !track.enabled;
            track.enabled = next;
            setAudioEnabled(next);
        }
    }, []);

    /* ──────────────────── camera flip ────────────────────────────────── */

    const flipCamera = useCallback(async () => {
        const pc = pcRef.current;
        const oldStream = localStreamRef.current;
        if (!pc || !oldStream) return;

        const useFrontNext = !facingFront;

        /* acquire new stream with opposite facing */
        const newStream = await acquireMedia(useFrontNext);
        if (!newStream) return;

        /* stop old video track */
        const oldVideoTrack = oldStream.getVideoTracks?.()?.[0];
        if (oldVideoTrack) {
            try {
                oldVideoTrack.stop();
            } catch {}
        }

        /* replace the video track inside the RTCPeerConnection sender */
        const newVideoTrack = newStream.getVideoTracks?.()?.[0];
        if (newVideoTrack) {
            const senders: any[] = pc.getSenders?.() ?? [];
            const videoSender = senders.find(
                (s: any) => s.track?.kind === 'video',
            );
            if (videoSender?.replaceTrack) {
                try {
                    await videoSender.replaceTrack(newVideoTrack);
                } catch (err: any) {
                    console.warn(
                        '[LiveGlass] replaceTrack error:',
                        err?.message,
                    );
                }
            }
        }

        /*
         * Build a composite stream reference that keeps the original
         * audio track but uses the new video track.
         */
        const oldAudioTrack = oldStream.getAudioTracks?.()?.[0];
        if (Platform.OS === 'web' && oldAudioTrack && newVideoTrack) {
            const combined = new MediaStream([oldAudioTrack, newVideoTrack]);
            localStreamRef.current = combined;
            setLocalStream(combined);
        } else {
            /*
             * On native the new stream already contains a fresh audio track
             * that mirrors the enabled state of the old one.
             */
            const freshAudio = newStream.getAudioTracks?.()?.[0];
            if (freshAudio && oldAudioTrack) {
                freshAudio.enabled = oldAudioTrack.enabled;
            }
            localStreamRef.current = newStream;
            setLocalStream(newStream);
        }

        setFacingFront(useFrontNext);
    }, [facingFront, acquireMedia]);

    /* ──────────────────── handle close ───────────────────────────────── */

    const handleClose = useCallback(() => {
        cleanup();
        onClose();
    }, [cleanup, onClose]);

    /* ──────────────────── derived values ─────────────────────────────── */

    const statusColor =
        status === 'CONNECTED'
            ? '#4ADE80'
            : status === 'FAILED'
              ? '#EF4444'
              : THEME.faint;

    const statusLabel =
        status === 'CONNECTED'
            ? 'CONNECTED'
            : status === 'FAILED'
              ? 'CONNECTION FAILED'
              : 'CONNECTING...';

    /* ═══════════════════════════ RENDER ═══════════════════════════════ */

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <View style={styles.root}>
                {/* ── header ─────────────────────────────────────────── */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <View
                            style={[styles.liveDot, { backgroundColor: statusColor }]}
                        />
                        <Text style={styles.title}>LIVE GLASS</Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.closeBtn}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        activeOpacity={0.7}
                        accessibilityLabel="Close live glass"
                        accessibilityRole="button"
                    >
                        <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* ── error banner ───────────────────────────────────── */}
                {error && (
                    <View style={styles.errorBanner}>
                        <Ionicons
                            name="warning-outline"
                            size={16}
                            color="#EF4444"
                        />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* ── connection status ──────────────────────────────── */}
                <View style={styles.statusRow}>
                    {status === 'CONNECTING' && (
                        <ActivityIndicator
                            size="small"
                            color={THEME.faint}
                            style={{ marginRight: 8 }}
                        />
                    )}
                    <Text style={[styles.statusText, { color: statusColor }]}>
                        {statusLabel}
                    </Text>
                </View>

                {/* ── partner (remote) feed ──────────────────────────── */}
                <View style={styles.feedSection}>
                    <Text style={styles.feedLabel}>PARTNER FEED</Text>
                    <View style={styles.feedContainer}>
                        {remoteStream ? (
                            <View style={StyleSheet.absoluteFill}>
                                {Platform.OS === 'web' ? (
                                    <View
                                        style={
                                            [
                                                StyleSheet.absoluteFill,
                                                { filter: 'grayscale(100%)' },
                                            ] as any
                                        }
                                    >
                                        <WebVideo
                                            stream={remoteStream}
                                            muted={false}
                                        />
                                    </View>
                                ) : RTCViewNative ? (
                                    <GrayscaleWrap>
                                        <RTCViewNative
                                            streamURL={remoteStream.toURL()}
                                            style={StyleSheet.absoluteFill}
                                            objectFit="cover"
                                            zOrder={0}
                                        />
                                    </GrayscaleWrap>
                                ) : (
                                    <View style={styles.noSignal}>
                                        <Text style={styles.noSignalText}>
                                            RTCView unavailable
                                        </Text>
                                    </View>
                                )}

                                {/* blur overlay — local control only */}
                                {blurIntensity > 0 && (
                                    <BlurView
                                        intensity={blurIntensity}
                                        tint="dark"
                                        style={StyleSheet.absoluteFill}
                                    />
                                )}
                            </View>
                        ) : (
                            <View style={styles.noSignal}>
                                <Ionicons
                                    name="videocam-off-outline"
                                    size={32}
                                    color={THEME.faint}
                                />
                                <Text style={styles.noSignalText}>
                                    WAITING FOR PARTNER
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* ── local camera feed ──────────────────────────────── */}
                <View style={styles.feedSection}>
                    <Text style={styles.feedLabel}>YOUR CAMERA</Text>
                    <View style={styles.localCameraContainer}>
                        {localStream ? (
                            Platform.OS === 'web' ? (
                                <View
                                    style={
                                        [
                                            StyleSheet.absoluteFill,
                                            { filter: 'grayscale(100%)' },
                                        ] as any
                                    }
                                >
                                    <WebVideo
                                        stream={localStream}
                                        muted
                                        mirror
                                    />
                                </View>
                            ) : RTCViewNative ? (
                                <GrayscaleWrap>
                                    <RTCViewNative
                                        streamURL={localStream.toURL()}
                                        style={StyleSheet.absoluteFill}
                                        objectFit="cover"
                                        mirror
                                        zOrder={1}
                                    />
                                </GrayscaleWrap>
                            ) : (
                                <View style={styles.noSignal}>
                                    <Text style={styles.noSignalText}>
                                        RTCView unavailable
                                    </Text>
                                </View>
                            )
                        ) : (
                            <View style={styles.noSignal}>
                                <Ionicons
                                    name="camera-outline"
                                    size={24}
                                    color={THEME.faint}
                                />
                                <Text style={styles.noSignalText}>
                                    STARTING CAMERA...
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* ── controls ───────────────────────────────────────── */}
                <View style={styles.controls}>
                    {/* blur slider */}
                    <View style={styles.blurControl}>
                        <Text style={styles.controlLabel}>BLUR</Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={100}
                            step={1}
                            value={blurIntensity}
                            onValueChange={setBlurIntensity}
                            minimumTrackTintColor="rgba(255,255,255,0.5)"
                            maximumTrackTintColor="rgba(255,255,255,0.15)"
                            thumbTintColor="#fff"
                        />
                        <Text style={styles.controlValue}>
                            {Math.round(blurIntensity)}
                        </Text>
                    </View>

                    {/* action buttons row */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[
                                styles.controlBtn,
                                !audioEnabled && styles.controlBtnActive,
                            ]}
                            onPress={toggleAudio}
                            activeOpacity={0.7}
                            accessibilityLabel={
                                audioEnabled ? 'Mute audio' : 'Unmute audio'
                            }
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name={audioEnabled ? 'mic' : 'mic-off'}
                                size={16}
                                color={audioEnabled ? '#fff' : '#000'}
                            />
                            <Text
                                style={[
                                    styles.controlBtnText,
                                    !audioEnabled && { color: '#000' },
                                ]}
                            >
                                {audioEnabled ? 'AUDIO ON' : 'MUTED'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.controlBtn}
                            onPress={flipCamera}
                            activeOpacity={0.7}
                            accessibilityLabel="Flip camera"
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="camera-reverse-outline"
                                size={16}
                                color="#fff"
                            />
                            <Text style={styles.controlBtnText}>FLIP</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── end session button ─────────────────────────────── */}
                <TouchableOpacity
                    onPress={handleClose}
                    style={styles.endBtn}
                    activeOpacity={0.7}
                    accessibilityLabel="End session"
                    accessibilityRole="button"
                >
                    <Text style={styles.endBtnText}>END SESSION</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

/* ═══════════════════════════════ STYLES ═══════════════════════════════════ */

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: THEME.bg,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },

    /* header */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#fff',
        textTransform: 'uppercase',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* status */
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    statusText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },

    /* error */
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    errorText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: '#EF4444',
        flex: 1,
    },

    /* feeds */
    feedSection: {
        flex: 1,
        marginBottom: 8,
    },
    feedLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        color: THEME.faint,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    feedContainer: {
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    localCameraContainer: {
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    noSignal: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    noSignalText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.faint,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },

    /* controls */
    controls: {
        gap: 10,
        paddingVertical: 10,
    },
    blurControl: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    controlLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.5,
        color: THEME.muted,
        textTransform: 'uppercase',
        width: 36,
    },
    slider: {
        flex: 1,
        height: 30,
    },
    controlValue: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        color: THEME.ink,
        minWidth: 28,
        textAlign: 'right',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    controlBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    controlBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    controlBtnText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1,
        color: '#fff',
        textTransform: 'uppercase',
    },

    /* end session */
    endBtn: {
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        marginBottom: Platform.OS === 'ios' ? 20 : 10,
    },
    endBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2.2,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
});
