import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Platform, Modal,
    BackHandler, AppState, AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { BlurView } from 'expo-blur';
import { THEME } from '../constants/Theme';
import { useSecurity } from '../contexts/SecurityContext';
import { fetchIceServers } from '../lib/iceServers';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Conditionally import RTCView for native viewer rendering
// ---------------------------------------------------------------------------
let RTCView: any = null;
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;
let NativeGrayscale: any = null;
if (Platform.OS !== 'web') {
    try {
        const RNWebRTC = require('react-native-webrtc');
        RTCView = RNWebRTC.RTCView;
        NativeRTCSessionDescription = RNWebRTC.RTCSessionDescription;
        NativeRTCIceCandidate = RNWebRTC.RTCIceCandidate;
        NativeGrayscale = require('react-native-color-matrix-image-filters').Grayscale;
    } catch (e) { }
}

// ICE servers are fetched dynamically from the server (includes TURN)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ScreenSharePanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
    isSharer: boolean; // true = this user is sharing their screen
    minimized?: boolean;
    onMinimize?: () => void;
    onMaximize?: () => void;
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
    minimized,
    onMinimize,
    onMaximize,
}: ScreenSharePanelProps) {
    // Bypass biometric lock while screen sharing is active
    const { setScreenShareActive } = useSecurity();

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
    const [isBnW, setIsBnW] = useState(true);

    // Viewer receives blur from sharer
    const [remoteBlur, setRemoteBlur] = useState(0);
    const [remoteIsBnW, setRemoteIsBnW] = useState(true);

    // Track whether we already created an offer/answer to avoid duplicates
    const hasNegotiatedRef = useRef(false);

    // Platform-aware WebRTC constructors
    const wrapSD = useCallback((payload: any) => {
        if (Platform.OS === 'web') {
            const SD = typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null;
            return SD ? new SD(payload) : payload;
        }
        return NativeRTCSessionDescription ? new NativeRTCSessionDescription(payload) : payload;
    }, []);

    const wrapICE = useCallback((payload: any) => {
        if (Platform.OS === 'web') {
            const IC = typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null;
            return IC ? new IC(payload) : payload;
        }
        return NativeRTCIceCandidate ? new NativeRTCIceCandidate(payload) : payload;
    }, []);

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
    const createPeerConnection = useCallback(async () => {
        const PeerConn = getRTCPeerConnection();
        if (!PeerConn) {
            setStatus('unsupported');
            setErrorMsg('WebRTC is not available on this platform.');
            return null;
        }

        const iceServers = await fetchIceServers();
        const pc = new PeerConn({ iceServers });

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
            console.log(`[ScreenShare] ICE state: ${state}`);
            if (state === 'connected' || state === 'completed') {
                setStatus('active');
            } else if (state === 'failed') {
                setStatus('error');
                setErrorMsg('Connection failed. Both devices may need to be on the same network, or a relay server is required.');
            } else if (state === 'disconnected') {
                setStatus('error');
                setErrorMsg('Connection lost. Please try again.');
            }
        };

        (pc as any).onconnectionstatechange = () => {
            console.log(`[ScreenShare] Connection state: ${(pc as any).connectionState}`);
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
    // Helper: create and send WebRTC offer (used by sharer on init and on viewer_ready)
    // ------------------------------------------------------------------
    const createAndSendOffer = useCallback(async (pc: any) => {
        if (!socket || !pc) return;
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
    }, [socket, roomId]);

    // ------------------------------------------------------------------
    // Sharer: capture screen and create offer
    // ------------------------------------------------------------------
    const startSharing = useCallback(async () => {
        if (!socket || !roomId) return;

        // Native platforms: use react-native-webrtc's getDisplayMedia
        if (Platform.OS !== 'web') {
            setStatus('connecting');

            let nativeStream: MediaStream | null = null;
            try {
                const RNWebRTC = require('react-native-webrtc');
                const { mediaDevices } = RNWebRTC;

                if (!mediaDevices || !mediaDevices.getDisplayMedia) {
                    setStatus('error');
                    setErrorMsg('Screen capture is not available on this device. Ensure you are using the latest APK build.');
                    return;
                }

                // This triggers Android's MediaProjection permission dialog
                // The foreground service is started automatically by react-native-webrtc
                nativeStream = await mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false, // audio capture from other apps requires extra setup
                });
            } catch (e: any) {
                const msg = e?.message || '';
                console.warn('[ScreenShare] getDisplayMedia failed:', msg, e);

                if (msg.includes('permission') || msg.includes('denied') || msg.includes('cancel')) {
                    setStatus('error');
                    setErrorMsg('Screen capture permission was denied. Please try again and tap "Start now" when prompted.');
                } else {
                    setStatus('error');
                    setErrorMsg('Screen capture failed: ' + (msg || 'Unknown error. Please restart the app and try again.'));
                }
                return;
            }

            if (!nativeStream || nativeStream.getTracks().length === 0) {
                setStatus('error');
                setErrorMsg('No screen capture stream received. Please try again.');
                return;
            }

            localStreamRef.current = nativeStream;

            // Listen for track ending (user stopped sharing via system notification)
            nativeStream.getVideoTracks().forEach(track => {
                track.addEventListener?.('ended', () => {
                    handleStopSharing();
                });
            });

            const pc = await createPeerConnection();
            if (!pc) return;

            nativeStream.getTracks().forEach(track => {
                pc.addTrack(track, nativeStream!);
            });

            // Use shared helper so viewer_ready re-offers go through same path
            await createAndSendOffer(pc);
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

            const pc = await createPeerConnection();
            if (!pc) return;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            await createAndSendOffer(pc);
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
    }, [socket, roomId, createPeerConnection, createAndSendOffer]);

    // ------------------------------------------------------------------
    // Viewer: prepare to receive an offer, then signal readiness to sharer
    // ------------------------------------------------------------------
    const prepareViewer = useCallback(async () => {
        if (!socket || !roomId) return;

        setStatus('connecting');
        // Create peer connection first so the offer handler can use it immediately
        await createPeerConnection();

        // Tell the sharer we are ready — they will (re-)send the offer now
        socket.emit('screen_share_signal', {
            roomId,
            type: 'viewer_ready',
        });
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

            let pc = pcRef.current;

            // --- viewer_ready: sharer (re-)sends the offer ---
            // Triggered when the viewer's panel finishes opening. This resolves
            // the race condition where the offer was sent before the viewer's
            // socket listener was registered.
            if (data.type === 'viewer_ready' && isSharer) {
                if (!pc) return; // sharer not started yet — startSharing will call createAndSendOffer
                // Re-create the offer from the existing PC (tracks already added)
                await createAndSendOffer(pc);
                return;
            }

            // --- Offer (viewer receives this) ---
            if (data.type === 'offer' && !isSharer && !pc) {
                pc = await createPeerConnection();
            }
            if (data.type === 'offer' && !isSharer && pc) {
                try {
                    await pc.setRemoteDescription(
                        wrapSD({ type: 'offer', sdp: data.sdp! }),
                    );

                    // Flush any pending ICE candidates
                    for (const c of pendingCandidatesRef.current) {
                        try { await pc.addIceCandidate(wrapICE(c)); } catch { }
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
                        wrapSD({ type: 'answer', sdp: data.sdp! }),
                    );

                    // Flush any pending ICE candidates
                    for (const c of pendingCandidatesRef.current) {
                        try { await pc.addIceCandidate(wrapICE(c)); } catch { }
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
                        await pc.addIceCandidate(wrapICE(data.candidate));
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
    }, [socket, roomId, visible, isSharer, createPeerConnection, createAndSendOffer]);

    // ------------------------------------------------------------------
    // Receive blur controls (viewer side)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket || !roomId || !visible || isSharer) return;

        const handleControls = (data: { roomId: string; controls: { blur: number; isBnW?: boolean } }) => {
            if (data.roomId === roomId) {
                setRemoteBlur(data.controls.blur);
                if (data.controls.isBnW !== undefined) {
                    setRemoteIsBnW(data.controls.isBnW);
                }
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
            controls: { blur, isBnW },
        });
    }, [blur, isBnW, socket, roomId, visible, isSharer]);

    // ------------------------------------------------------------------
    // Bypass biometric lock during active screen share (sharer side)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (visible && isSharer) {
            setScreenShareActive(true);
        }
        return () => {
            if (isSharer) setScreenShareActive(false);
        };
    }, [visible, isSharer, setScreenShareActive]);

    // ------------------------------------------------------------------
    // Auto-minimize after connection becomes active (sharer side)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (status === 'active' && isSharer && onMinimize && !minimized) {
            const timer = setTimeout(() => {
                onMinimize();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [status, isSharer, onMinimize, minimized]);

    // ------------------------------------------------------------------
    // Keep session alive when app returns from background during screen share
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!visible || !isSharer) return;

        const handleAppState = (nextState: AppStateStatus) => {
            if (nextState === 'active' && status === 'active') {
                // App returned to foreground while sharing — ensure biometric stays bypassed
                setScreenShareActive(true);
            }
        };

        const subscription = AppState.addEventListener('change', handleAppState);
        return () => subscription.remove();
    }, [visible, isSharer, status, setScreenShareActive]);

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
    // Render: Minimized pill (sharer only)
    // ------------------------------------------------------------------
    if (isSharer && minimized) {
        return (
            <TouchableOpacity
                onPress={onMaximize}
                style={styles.minimizedPill}
                activeOpacity={0.7}
            >
                <View style={styles.minimizedDot} />
                <Text style={styles.minimizedText}>SHARING</Text>
                <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); handleStopSharing(); }}
                    style={styles.minimizedStop}
                    activeOpacity={0.7}
                >
                    <Ionicons name="stop" size={10} color={THEME.bad} />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    }

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
                                    {errorMsg || 'Screen sharing is not available on this device.'}
                                </Text>
                            </View>
                        ) : status === 'error' ? (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="warning-outline" size={48} color={THEME.faint} />
                                <Text style={styles.messageTitle}>ERROR</Text>
                                <Text style={styles.messageSubtitle}>
                                    {errorMsg || 'Something went wrong.'}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => { cleanup(); startSharing(); }}
                                    style={styles.retryBtn}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.retryBtnText}>RETRY</Text>
                                </TouchableOpacity>
                            </View>
                        ) : status === 'connecting' ? (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="sync-outline" size={48} color={THEME.muted} />
                                <Text style={styles.messageTitle}>CONNECTING...</Text>
                                <Text style={styles.messageSubtitle}>
                                    Waiting for viewer to join.{'\n'}
                                    Tap "Start now" if prompted.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.centeredMessage}>
                                <Ionicons name="desktop-outline" size={48} color={THEME.live} />
                                <Text style={[styles.messageTitle, { color: THEME.live }]}>
                                    YOUR SCREEN IS{'\n'}BEING SHARED
                                </Text>
                                <Text style={styles.messageSubtitle}>
                                    App will minimize. Your entire screen{'\n'}is visible to your partner.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Controls */}
                    {(status === 'active' || status === 'connecting') && (
                        <View style={styles.controls}>
                            <TouchableOpacity
                                style={{
                                    width: 38, height: 38, borderRadius: 19,
                                    backgroundColor: !isBnW ? '#fff' : 'rgba(255,255,255,0.1)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                                onPress={() => setIsBnW(!isBnW)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name={isBnW ? "contrast" : "color-palette"} size={16} color={isBnW ? '#fff' : '#000'} />
                            </TouchableOpacity>
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
                        <View style={{ flex: 1 }}>
                            {NativeGrayscale && remoteIsBnW ? (
                                <NativeGrayscale style={StyleSheet.absoluteFill}>
                                    <RTCView
                                        streamURL={nativeStreamURL}
                                        style={styles.nativeVideo}
                                        objectFit="contain"
                                    />
                                </NativeGrayscale>
                            ) : (
                                <RTCView
                                    streamURL={nativeStreamURL}
                                    style={styles.nativeVideo}
                                    objectFit="contain"
                                />
                            )}
                        </View>
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

    // Retry button
    retryBtn: {
        marginTop: 16,
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    retryBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#fff',
        textTransform: 'uppercase',
    },

    // Minimized pill
    minimizedPill: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 36,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        zIndex: 9998,
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    minimizedDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 6,
    },
    minimizedText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#fff',
        textTransform: 'uppercase',
    },
    minimizedStop: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
    },
});
