import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Image, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { THEME } from '../constants/Theme';
import type { Socket } from 'socket.io-client';

interface LiveGlassPanelProps {
    visible: boolean;
    onClose: () => void;
    socket: Socket | null;
    roomId: string;
}

export default function LiveGlassPanel({ visible, onClose, socket, roomId }: LiveGlassPanelProps) {
    const [remoteFrame, setRemoteFrame] = useState<string | null>(null);
    const [blur, setBlur] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [hasCamera, setHasCamera] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const cameraRef = useRef<any>(null);
    const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Listen for remote frames
    useEffect(() => {
        if (!socket || !roomId || !visible) return;

        const handleFrame = (data: { roomId: string; frame: string }) => {
            if (data.roomId === roomId) {
                setRemoteFrame(data.frame);
            }
        };

        socket.on('remote_live_glass_frame', handleFrame);
        return () => {
            socket.off('remote_live_glass_frame', handleFrame);
        };
    }, [socket, roomId, visible]);

    // Start/stop frame capture
    useEffect(() => {
        if (!visible) {
            // Stop capturing
            if (frameIntervalRef.current) {
                clearInterval(frameIntervalRef.current);
                frameIntervalRef.current = null;
            }
            setRemoteFrame(null);
            setCameraReady(false);
            return;
        }

        // Initialize camera on native
        if (Platform.OS !== 'web') {
            initNativeCamera();
        } else {
            initWebCamera();
        }

        return () => {
            if (frameIntervalRef.current) {
                clearInterval(frameIntervalRef.current);
                frameIntervalRef.current = null;
            }
        };
    }, [visible]);

    // Native camera initialization
    const initNativeCamera = async () => {
        try {
            const { Camera } = require('expo-camera');
            const { status } = await Camera.requestCameraPermissionsAsync();
            if (status === 'granted') {
                setHasCamera(true);
            }
        } catch (e) {
            console.error('[LiveGlass] Camera init failed:', e);
        }
    };

    // Web camera initialization
    const initWebCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false,
            });
            setHasCamera(true);
            // Store stream for cleanup
            (cameraRef as any).current = stream;

            // Start frame capture for web
            startWebFrameCapture(stream);
        } catch (e) {
            console.error('[LiveGlass] Web camera failed:', e);
        }
    };

    // Web: capture frames from video stream
    const startWebFrameCapture = (stream: MediaStream) => {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        frameIntervalRef.current = setInterval(() => {
            if (video.readyState >= 2 && socket) {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 240;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Apply grayscale
                    ctx.filter = 'grayscale(100%)';
                    ctx.drawImage(video, 0, 0, 320, 240);
                    const frame = canvas.toDataURL('image/jpeg', 0.3);
                    socket.emit('transmit_live_glass_frame', { roomId, frame });
                }
            }
        }, 200); // ~5 FPS
    };

    // Native: capture frames from expo-camera
    const captureNativeFrame = useCallback(async () => {
        if (!cameraRef.current || !socket || !cameraReady) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.1,
                skipProcessing: true,
                exif: false,
            });
            if (photo?.base64) {
                const frame = `data:image/jpeg;base64,${photo.base64}`;
                // Only send if under size limit
                if (frame.length < 200000) {
                    socket.emit('transmit_live_glass_frame', { roomId, frame });
                }
            }
        } catch (e) {
            // Silently skip frame on error
        }
    }, [socket, roomId, cameraReady]);

    // Start native frame capture loop
    useEffect(() => {
        if (!visible || !cameraReady || Platform.OS === 'web') return;

        frameIntervalRef.current = setInterval(() => {
            captureNativeFrame();
        }, 300); // ~3 FPS on native (slower due to capture overhead)

        return () => {
            if (frameIntervalRef.current) {
                clearInterval(frameIntervalRef.current);
                frameIntervalRef.current = null;
            }
        };
    }, [visible, cameraReady, captureNativeFrame]);

    // Cleanup web camera on close
    useEffect(() => {
        if (!visible && Platform.OS === 'web' && cameraRef.current) {
            const stream = cameraRef.current as MediaStream;
            if (stream.getTracks) {
                stream.getTracks().forEach(t => t.stop());
            }
            cameraRef.current = null;
        }
    }, [visible]);

    // Send video controls to partner
    useEffect(() => {
        if (!socket || !roomId || !visible) return;
        socket.emit('transmit_video_controls', { roomId, controls: { blur, isBnW: true, isMuted } });
    }, [blur, isMuted, socket, roomId, visible]);

    if (!visible) return null;

    // Render native camera component
    const renderNativeCamera = () => {
        if (Platform.OS === 'web') return null;
        try {
            const { CameraView } = require('expo-camera');
            return (
                <CameraView
                    ref={cameraRef}
                    style={styles.cameraPreview}
                    facing="front"
                    onCameraReady={() => setCameraReady(true)}
                />
            );
        } catch {
            return (
                <View style={styles.cameraPlaceholder}>
                    <Text style={styles.placeholderText}>CAMERA UNAVAILABLE</Text>
                </View>
            );
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <View style={styles.liveDot} />
                        <Text style={styles.headerTitle}>LIVE GLASS</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Partner Feed */}
                <View style={styles.feedSection}>
                    <Text style={styles.feedLabel}>PARTNER FEED</Text>
                    <View style={styles.feedContainer}>
                        {remoteFrame ? (
                            <Image
                                source={{ uri: remoteFrame }}
                                style={[styles.feedImage, { opacity: 1 - (blur / 200) }]}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={styles.noSignal}>
                                <Ionicons name="videocam-off-outline" size={32} color={THEME.faint} />
                                <Text style={styles.noSignalText}>NO SIGNAL</Text>
                            </View>
                        )}
                        {remoteFrame && blur > 0 && (
                            <View style={[styles.blurOverlay, { backgroundColor: `rgba(0,0,0,${blur / 100 * 0.8})` }]} />
                        )}
                    </View>
                </View>

                {/* Your Camera */}
                <View style={styles.feedSection}>
                    <Text style={styles.feedLabel}>YOUR CAMERA</Text>
                    <View style={styles.localCameraContainer}>
                        {hasCamera ? (
                            Platform.OS === 'web' ? (
                                <View style={styles.cameraPlaceholder}>
                                    <Ionicons name="videocam-outline" size={24} color={THEME.live} />
                                    <Text style={styles.cameraActiveText}>STREAMING</Text>
                                </View>
                            ) : (
                                renderNativeCamera()
                            )
                        ) : (
                            <View style={styles.cameraPlaceholder}>
                                <Ionicons name="camera-outline" size={24} color={THEME.faint} />
                                <Text style={styles.placeholderText}>INITIALIZING...</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Controls */}
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

                    <TouchableOpacity
                        onPress={() => setIsMuted(!isMuted)}
                        style={[styles.muteBtn, isMuted && styles.muteBtnActive]}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isMuted ? 'mic-off' : 'mic'}
                            size={16}
                            color={isMuted ? '#000' : '#fff'}
                        />
                        <Text style={[styles.muteBtnText, isMuted && { color: '#000' }]}>
                            {isMuted ? 'MUTED' : 'AUDIO ON'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Close Button */}
                <TouchableOpacity onPress={onClose} style={styles.endBtn} activeOpacity={0.7}>
                    <Text style={styles.endBtnText}>END SESSION</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },
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
    feedSection: {
        flex: 1,
        marginBottom: 8,
    },
    feedLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: THEME.faint,
        textTransform: 'uppercase',
        marginBottom: 6,
        fontWeight: '900',
    },
    feedContainer: {
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    feedImage: {
        width: '100%',
        height: '100%',
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
    blurOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    localCameraContainer: {
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    cameraPreview: {
        flex: 1,
    },
    cameraPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    placeholderText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.faint,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    cameraActiveText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.live,
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontWeight: '900',
    },
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
    muteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    muteBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    muteBtnText: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1,
        color: '#fff',
        textTransform: 'uppercase',
        fontWeight: '900',
    },
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
