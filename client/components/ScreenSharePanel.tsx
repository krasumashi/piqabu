import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { BlurView } from 'expo-blur';
import { THEME } from '../constants/Theme';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Grayscale wrapper: native uses color-matrix-image-filters, web uses CSS
// ---------------------------------------------------------------------------
let NativeGrayscale: any = null;
if (Platform.OS !== 'web') {
    try {
        NativeGrayscale = require('react-native-color-matrix-image-filters').Grayscale;
    } catch (e) { }
}

function GrayscaleWrap({ children }: { children: React.ReactNode }) {
    if (Platform.OS === 'web') {
        return <View style={{ filter: 'grayscale(100%)' } as any}>{children}</View>;
    }
    if (NativeGrayscale) {
        return <NativeGrayscale>{children}</NativeGrayscale>;
    }
    return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Conditionally import RTCView for native viewer rendering
// ---------------------------------------------------------------------------
let RTCView: any = null;
if (Platform.OS !== 'web') {
    try {
        RTCView = require('react-native-webrtc').RTCView;
    } catch (e) { }
}

// ---------------------------------------------------------------------------
// ICE servers
// ---------------------------------------------------------------------------
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ScreenSharePanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
    isSharer: boolean; // true = this user is sharing their screen
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ScreenSharePanel({
    visible,
    onClose,
    socket,
    roomId,
    isSharer,
}: ScreenSharePanelProps) {
    // WebRTC state
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);

    // Web video element ref (viewer side)
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Native stream URL (viewer side)
    const [nativeStreamURL, setNativeStreamURL] = useState<string | null>(null);

    // Connection / UI state
    const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error' | 'unsupported'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Sharer controls
    const [blur, setBlur] = useState(0);

    // Viewer receives blur from sharer
    const [remoteBlur, setRemoteBlur] = useState(0);

    // Track whether we already created an offer/answer to avoid duplicates
    const hasNegotiatedRef = useRef(false);

    // Pending ICE candidates received before remote description is set
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Get the correct RTCPeerConnection constructor for this platform */
    const getRTCPeerConnection = useCallback((): typeof RTCPeerConnection | null => {
        if (Platform.OS === 'web') {
            return typeof window !== 'undefined' ? window.RTCPeerConnection : null;
        }
        try {
            return require('react-native-webrtc').RTCPeerConnection;
        } catch {
            return null;
        }
    }, []);

    /** Clean up a peer connection and streams */
    const cleanup = useCallback(() => {
        // Stop local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        // Close peer connection
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        remoteStreamRef.current = null;
        setNativeStreamURL(null);

        // Detach web video element
        if (Platform.OS === 'web' && videoRef.current) {
            videoRef.current.srcObject = null;
        }

        hasNegotiatedRef.current = false;
        pendingCandidatesRef.current = [];
        setStatus('idle');
        setErrorMsg(null);
        setBlur(0);
        setRemoteBlur(0);
    }, []);

    // ------------------------------------------------------------------
    // Create RTCPeerConnection and wire up handlers
    // ------------------------------------------------------------------
    const createPeerConnection = useCallback(() => {
        const PeerConn = getRTCPeerConnection();
        if (!PeerConn) {
            setStatus('unsupported');
            setErrorMsg('WebRTC is not available on this platform.');
            return null;
        }

        const pc = new PeerConn({ iceServers: ICE_SERVERS });

        // ICE candidates -> send to remote via signaling
        pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate && socket) {
                socket.emit('screen_share_signal', {
                    roomId,
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON
                        ? event.candidate.toJSON()
                        : event.candidate,
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            if (state === 'connected' || state === 'completed') {
                setStatus('active');
            } else if (state === 'failed' || state === 'disconnected') {
                setStatus('error');
                setErrorMsg('Connection lost. Please try again.');
            }
        };

        // Viewer side: receive remote stream
        if (!isSharer) {
            pc.ontrack = (event: RTCTrackEvent) => {
                const stream = event.streams?.[0];
                if (!stream) return;
                remoteStreamRef.current = stream;

                if (Platform.OS === 'web') {
                    // Attach to <video> element
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } else {
                    // react-native-webrtc uses toURL()
                    setNativeStreamURL((stream as any).toURL ? (stream as any).toURL() : null);
                }
            };
        }

        pcRef.current = pc;
        return pc;
    }, [getRTCPeerConnection, socket, roomId, isSharer]);

    // ------------------------------------------------------------------
    // Sharer: capture screen and create offer
    // ------------------------------------------------------------------
    const startSharing = useCallback(async () => {
        if (!socket || !roomId) return;

        // Native platforms: screen capture is not reliably available
        if (Platform.OS !== 'web') {
            let nativeStream: MediaStream | null = null;
            try {
                const { mediaDevices } = require('react-native-webrtc');
                // react-native-webrtc's getDisplayMedia (Android only, requires foreground service)
                nativeStream = await mediaDevices.getDisplayMedia({ video: true, audio: true });
            } catch {
                nativeStream = null;
            }

            if (!nativeStream) {
                setStatus('unsupported');
                setErrorMsg('Screen sharing is available on web. Native screen capture is not supported on this device.');
                return;
            }

            // If we did get a native stream, proceed
            localStreamRef.current = nativeStream;
            setStatus('connecting');

            const pc = createPeerConnection();
            if (!pc) return;

            nativeStream.getTracks().forEach(track => {
                pc.addTrack(track, nativeStream!);
            });

            try {
                const offer = await pc.createOffer({} as any);
                await pc.setLocalDescription(offer);
                socket.emit('screen_share_signal', {
                    roomId,
                    type: 'offer',
                    sdp: offer.sdp,
                });
                hasNegotiatedRef.current = true;
            } catch (e: any) {
                setStatus('error');
                setErrorMsg('Failed to create WebRTC offer: ' + (e?.message || 'unknown error'));
            }
            return;
        }

        // --- Web platform ---
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
            setStatus('unsupported');
            setErrorMsg('Screen sharing is not supported in this browser.');
            return;
        }

        setStatus('connecting');

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
            });

            localStreamRef.current = stream;

            // Listen for the user ending screen share via browser UI
            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                handleStopSharing();
            });

            const pc = createPeerConnection();
            if (!pc) return;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('screen_share_signal', {
                roomId,
                type: 'offer',
                sdp: offer.sdp,
            });
            hasNegotiatedRef.current = true;
        } catch (e: any) {
            // User denied permission or browser doesn't support
            if (e?.name === 'NotAllowedError') {
                setStatus('error');
                setErrorMsg('Screen sharing permission was denied.');
            } else {
                setStatus('error');
                setErrorMsg('Failed to start screen sharing: ' + (e?.message || 'unknown error'));
            }
        }
    }, [socket, roomId, createPeerConnection]);

    // ------------------------------------------------------------------
    // Viewer: prepare to receive an offer
    // ------------------------------------------------------------------
    const prepareViewer = useCallback(() => {
        if (!socket || !roomId) return;

        setStatus('connecting');
        // Just create the peer connection; the actual answer happens in the
        // signal handler when an offer arrives.
        createPeerConnection();
    }, [socket, roomId, createPeerConnection]);

    // ------------------------------------------------------------------
    // Socket signaling handler
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket || !roomId || !visible) return;

        const handleSignal = async (data: {
            roomId: string;
            type: string;
            sdp?: string;
            candidate?: RTCIceCandidateInit;
        }) => {
            if (data.roomId !== roomId) return;

            const pc = pcRef.current;

            // --- Offer (viewer receives this) ---
            if (data.type === 'offer' && !isSharer && pc) {
                try {
                    await pc.setRemoteDescription(
                        new RTCSessionDescription({ type: 'offer', sdp: data.sdp! }),
                    );

                    // Flush any pending ICE candidates
                    for (const c of pendingCandidatesRef.current) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
                    }
                    pendingCandidatesRef.current = [];

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    socket.emit('screen_share_signal', {
                        roomId,
                        type: 'answer',
                        sdp: answer.sdp,
                    });
                    hasNegotiatedRef.current = true;
                } catch (e: any) {
                    setStatus('error');
                    setErrorMsg('Failed to handle incoming offer: ' + (e?.message || ''));
                }
            }

            // --- Answer (sharer receives this) ---
            if (data.type === 'answer' && isSharer && pc) {
                try {
                    await pc.setRemoteDescription(
                        new RTCSessionDescription({ type: 'answer', sdp: data.sdp! }),
                    );

                    // Flush any pending ICE candidates
                    for (const c of pendingCandidatesRef.current) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
                    }
                    pendingCandidatesRef.current = [];
                } catch (e: any) {
                    setStatus('error');
                    setErrorMsg('Failed to handle answer: ' + (e?.message || ''));
                }
            }

            // --- ICE candidate ---
            if (data.type === 'ice-candidate' && data.candidate && pc) {
                try {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        // Queue until remote description is set
                        pendingCandidatesRef.current.push(data.candidate);
                    }
                } catch {
                    // Non-critical: some candidates may be redundant
                }
            }
        };

        socket.on('screen_share_signal', handleSignal);
        return () => {
            socket.off('screen_share_signal', handleSignal);
        };
    }, [socket, roomId, visible, isSharer]);

    // ------------------------------------------------------------------
    // Receive blur controls (viewer side)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket || !roomId || !visible || isSharer) return;

        const handleControls = (data: { roomId: string; controls: { blur: number } }) => {
            if (data.roomId === roomId) {
                setRemoteBlur(data.controls.blur);
            }
        };

        socket.on('transmit_screen_share_controls', handleControls);
        return () => {
            socket.off('transmit_screen_share_controls', handleControls);
        };
    }, [socket, roomId, visible, isSharer]);

    // ------------------------------------------------------------------
    // Send blur controls (sharer side)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket || !roomId || !visible || !isSharer) return;
        socket.emit('transmit_screen_share_controls', {
            roomId,
            controls: { blur },
        });
    }, [blur, socket, roomId, visible, isSharer]);

    // ------------------------------------------------------------------
    // Init / teardown on visibility change
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!visible) {
            cleanup();
            return;
        }

        if (isSharer) {
            startSharing();
        } else {
            prepareViewer();
        }

        return () => {
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // ------------------------------------------------------------------
    // Stop sharing (sharer only)
    // ------------------------------------------------------------------
    const handleStopSharing = useCallback(() => {
        cleanup();
        onClose();
    }, [cleanup, onClose]);

    // ------------------------------------------------------------------
    // Attach <video> element on web (viewer)
    // ------------------------------------------------------------------
    const videoContainerRef = useRef<View | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'web' || isSharer || !visible) return;

        // Create a <video> element for the remote stream
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = false;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.filter = 'grayscale(100%)';
        video.style.backgroundColor = '#000';

        videoRef.current = video;

        // If we already have a remote stream, attach it
        if (remoteStreamRef.current) {
            video.srcObject = remoteStreamRef.current;
        }

        // Find the container DOM node and append the video
        const containerId = '__screen_share_video_container__';
        const tryAttach = () => {
            let container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
                container.appendChild(video);
            } else {
                // Retry shortly; React may not have painted yet
                setTimeout(tryAttach, 100);
            }
        };
        tryAttach();

        return () => {
            if (video.parentNode) {
                video.parentNode.removeChild(video);
            }
            video.srcObject = null;
            videoRef.current = null;
        };
    }, [visible, isSharer]);

    // ------------------------------------------------------------------
    // Bail early if not visible
    // ------------------------------------------------------------------
    if (!visible) return null;

    // ------------------------------------------------------------------
    // Render: SHARER view
    // ------------------------------------------------------------------
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
                        <TouchableOpacity onPress={handleStopSharing} style={styles.closeBtn} activeOpacity={0.7}>
                            <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Status area */}
                    <View style={styles.sharerBody}>
                        {status === 'unsupported' ? (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.faint} />
                                <Text style={styles.messageTitle}>NOT AVAILABLE</Text>
                                <Text style={styles.messageSubtitle}>
                                    {errorMsg || 'Screen sharing is available on web.'}
                                </Text>
                            </View>
                        ) : status === 'error' ? (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="warning-outline" size={48} color={THEME.faint} />
                                <Text style={styles.messageTitle}>ERROR</Text>
                                <Text style={styles.messageSubtitle}>
                                    {errorMsg || 'Something went wrong.'}
                                </Text>
                            </View>
                        ) : status === 'connecting' ? (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="sync-outline" size={48} color={THEME.muted} />
                                <Text style={styles.messageTitle}>CONNECTING...</Text>
                                <Text style={styles.messageSubtitle}>
                                    Waiting for viewer to join.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.live} />
                                <Text style={[styles.messageTitle, { color: THEME.live }]}>
                                    YOUR SCREEN IS{'\n'}BEING SHARED
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Controls */}
                    {(status === 'active' || status === 'connecting') && (
                        <View style={styles.controls}>
                            <View style={styles.blurControl}>
                                <Text style={styles.controlLabel}>BLUR</Text>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0}
                                    maximumValue={100}
                                    value={blur}
                                    onValueChange={(v: number) => setBlur(Math.round(v))}
                                    minimumTrackTintColor="rgba(255,255,255,0.5)"
                                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                                    thumbTintColor="#fff"
                                />
                                <Text style={styles.controlValue}>{blur}%</Text>
                            </View>
                        </View>
                    )}

                    {/* Stop sharing button */}
                    <TouchableOpacity onPress={handleStopSharing} style={styles.endBtn} activeOpacity={0.7}>
                        <Ionicons name="stop-circle-outline" size={16} color={THEME.muted} style={{ marginRight: 8 }} />
                        <Text style={styles.endBtnText}>STOP SHARING</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    // ------------------------------------------------------------------
    // Render: VIEWER view
    // ------------------------------------------------------------------
    const viewerBlur = remoteBlur;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Ionicons name="desktop-outline" size={14} color={THEME.muted} />
                        <Text style={styles.headerTitle}>SCREEN SHARE</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Viewing label */}
                <Text style={styles.viewingLabel}>VIEWING SCREEN SHARE</Text>

                {/* Stream display */}
                <View style={styles.feedContainer}>
                    {status === 'error' ? (
                        <View style={styles.noSignal}>
                            <Ionicons name="warning-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>
                                {errorMsg || 'Connection error.'}
                            </Text>
                        </View>
                    ) : status === 'connecting' ? (
                        <View style={styles.noSignal}>
                            <Ionicons name="hourglass-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>WAITING FOR STREAM...</Text>
                        </View>
                    ) : Platform.OS === 'web' ? (
                        // Web: use nativeID so we can find the DOM element
                        <View
                            ref={videoContainerRef}
                            nativeID="__screen_share_video_container__"
                            style={styles.webVideoContainer}
                        />
                    ) : nativeStreamURL && RTCView ? (
                        <GrayscaleWrap>
                            <RTCView
                                streamURL={nativeStreamURL}
                                style={styles.nativeVideo}
                                objectFit="contain"
                            />
                        </GrayscaleWrap>
                    ) : (
                        <View style={styles.noSignal}>
                            <Ionicons name="videocam-off-outline" size={32} color={THEME.faint} />
                            <Text style={styles.noSignalText}>NO STREAM</Text>
                        </View>
                    )}

                    {/* Blur overlay */}
                    {viewerBlur > 0 && status === 'active' && (
                        <BlurView
                            intensity={viewerBlur}
                            tint="dark"
                            style={StyleSheet.absoluteFillObject}
                        />
                    )}
                </View>

                {/* Close button */}
                <TouchableOpacity onPress={onClose} style={styles.endBtn} activeOpacity={0.7}>
                    <Text style={styles.endBtnText}>CLOSE</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
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
        backgroundColor: THEME.faint,
    },
    liveDotActive: {
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    headerTitle: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        color: '#fff',
        textTransform: 'uppercase',
        fontWeight: '900',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Viewing label
    viewingLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: THEME.faint,
        textTransform: 'uppercase',
        fontWeight: '900',
        marginBottom: 8,
    },

    // Sharer body
    sharerBody: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centeredMessage: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 32,
    },
    messageTitle: {
        fontFamily: THEME.mono,
        fontSize: 14,
        letterSpacing: 3,
        color: THEME.muted,
        textTransform: 'uppercase',
        fontWeight: '900',
        textAlign: 'center',
    },
    messageSubtitle: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 1,
        color: THEME.faint,
        textAlign: 'center',
        lineHeight: 16,
    },

    // Feed container (viewer)
    feedContainer: {
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#000',
        overflow: 'hidden',
        marginBottom: 12,
    },
    webVideoContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    nativeVideo: {
        flex: 1,
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
        textAlign: 'center',
        paddingHorizontal: 24,
    },

    // Controls
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
    },
    blurControl: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    controlLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.5,
        color: THEME.muted,
        textTransform: 'uppercase',
        fontWeight: '900',
    },
    slider: {
        flex: 1,
        height: 30,
    },
    controlValue: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.ink,
        fontWeight: '900',
        minWidth: 30,
        textAlign: 'right',
    },

    // End / stop / close button
    endBtn: {
        flexDirection: 'row',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
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
