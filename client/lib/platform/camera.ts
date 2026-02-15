import { Platform } from 'react-native';
import React from 'react';

// This module provides platform-specific camera components.
// On native: uses expo-camera CameraView + expo-blur BlurView
// On web: uses getUserMedia + CSS filter

export const IS_WEB = Platform.OS === 'web';

export interface CameraGlassSettings {
    blur: number;       // 0-100
    isBnW: boolean;
    isMuted: boolean;
}

// Web camera utilities
export async function requestWebCameraStream(): Promise<MediaStream | null> {
    if (!IS_WEB) return null;
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
        });
    } catch (e) {
        console.error('[Camera] Web camera access denied:', e);
        return null;
    }
}

export function stopWebCameraStream(stream: MediaStream | null): void {
    if (stream) {
        stream.getTracks().forEach((t) => t.stop());
    }
}

export function getCSSFilterString(settings: CameraGlassSettings): string {
    const filters: string[] = [];
    if (settings.blur > 0) {
        filters.push(`blur(${Math.round(settings.blur * 0.2)}px)`); // scale 0-100 to 0-20px
    }
    if (settings.isBnW) {
        filters.push('grayscale(100%)');
    }
    return filters.join(' ') || 'none';
}
