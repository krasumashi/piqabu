import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresenceData {
    activity: number;   // 0-1
    brightness: number; // 0-1
}

export interface UsePresenceResult {
    partnerPresence: PresenceData | null;
    sendPulseTap: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}

/** Euclidean magnitude of an {x,y,z} reading. */
function mag(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePresence(
    socket: Socket | null,
    roomId: string,
): UsePresenceResult {
    const [partnerPresence, setPartnerPresence] = useState<PresenceData | null>(null);

    // Sensor bookkeeping — refs so we avoid stale closures.
    const prevMag = useRef<number | null>(null);
    const currentActivity = useRef<number>(0.5);
    const currentBrightness = useRef<number>(0.5);

    // ------------------------------------------------------------------
    // sendPulseTap
    // ------------------------------------------------------------------
    const sendPulseTap = useCallback(() => {
        if (!socket || !roomId) return;
        socket.emit('transmit_pulse_tap', { roomId });
    }, [socket, roomId]);

    // ------------------------------------------------------------------
    // Sensor sampling (native only)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (Platform.OS === 'web') return;

        let accelSubscription: { remove: () => void } | null = null;

        try {
            const { Accelerometer } = require('expo-sensors');

            Accelerometer.setUpdateInterval(5000);

            accelSubscription = Accelerometer.addListener(
                (data: { x: number; y: number; z: number }) => {
                    const m = mag(data.x, data.y, data.z);
                    if (prevMag.current !== null) {
                        const delta = Math.abs(m - prevMag.current);
                        currentActivity.current = clamp(delta, 0, 1);
                    }
                    prevMag.current = m;
                },
            );
        } catch (_) {
            // expo-sensors unavailable — keep default activity 0.5
        }

        // Brightness sampling (best-effort)
        let brightnessInterval: ReturnType<typeof setInterval> | null = null;

        try {
            const Brightness = require('expo-brightness');

            const sampleBrightness = async () => {
                try {
                    const b: number = await Brightness.getBrightnessAsync();
                    currentBrightness.current = clamp(b, 0, 1);
                } catch (_) {
                    // leave as previous value
                }
            };

            // Initial + periodic sample aligned with emit cadence
            sampleBrightness();
            brightnessInterval = setInterval(sampleBrightness, 10_000);
        } catch (_) {
            // expo-brightness unavailable — keep default 0.5
        }

        return () => {
            accelSubscription?.remove();
            if (brightnessInterval) clearInterval(brightnessInterval);
        };
    }, []);

    // ------------------------------------------------------------------
    // Emit own presence every 10 s
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket || !roomId) return;

        const emitPresence = () => {
            socket.emit('transmit_presence', {
                roomId,
                activity: currentActivity.current,
                brightness: currentBrightness.current,
            });
        };

        // Emit immediately on mount, then every 10 s.
        emitPresence();
        const interval = setInterval(emitPresence, 10_000);

        return () => clearInterval(interval);
    }, [socket, roomId]);

    // ------------------------------------------------------------------
    // Listen: remote_presence
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        const onRemotePresence = (data: {
            roomId: string;
            activity: number;
            brightness: number;
        }) => {
            if (data.roomId !== roomId) return;
            setPartnerPresence({
                activity: clamp(data.activity, 0, 1),
                brightness: clamp(data.brightness, 0, 1),
            });
        };

        socket.on('remote_presence', onRemotePresence);
        return () => {
            socket.off('remote_presence', onRemotePresence);
        };
    }, [socket, roomId]);

    // ------------------------------------------------------------------
    // Listen: remote_pulse_tap → haptic feedback
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        const onRemotePulseTap = (data: { roomId: string }) => {
            if (data.roomId !== roomId) return;

            if (Platform.OS !== 'web') {
                try {
                    const Haptics = require('expo-haptics');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (_) {
                    // haptics unavailable
                }
            }
        };

        socket.on('remote_pulse_tap', onRemotePulseTap);
        return () => {
            socket.off('remote_pulse_tap', onRemotePulseTap);
        };
    }, [socket, roomId]);

    return { partnerPresence, sendPulseTap };
}
