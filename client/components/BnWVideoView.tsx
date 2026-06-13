/**
 * BnWVideoView
 *
 * JS wrapper around the native PiqabuBnWVideoView (Android only) —
 * a TextureView-based WebRTC renderer that applies a grayscale
 * ColorMatrix via RenderEffect for true black-and-white.
 *
 * Use this in place of RTCView in Live Glass when isBnW is on.
 * Same props you'd give to RTCView for the basics — streamURL, style,
 * mirror — minus the ones we don't support yet (objectFit, zOrder).
 * Scaling is hardcoded to SCALE_ASPECT_FILL on the native side, which
 * matches what we use in LiveGlassPanel today.
 *
 * iOS / older Android (< 12) note: native module is Android-only and
 * relies on API 31+ for the RenderEffect path. We export an iOS no-op
 * (transparent View) — callers should fall back to <RTCView> on iOS.
 */
import React from 'react';
import {
    Platform,
    UIManager,
    View,
    requireNativeComponent,
    type ViewProps,
} from 'react-native';

const NATIVE_NAME = 'PiqabuBnWVideoView';

interface BnWVideoViewProps extends ViewProps {
    streamURL: string;
    mirror?: boolean;
}

const NativeBnWVideoView =
    Platform.OS === 'android' && UIManager.getViewManagerConfig?.(NATIVE_NAME)
        ? requireNativeComponent<BnWVideoViewProps>(NATIVE_NAME)
        : null;

export default function BnWVideoView(props: BnWVideoViewProps) {
    if (!NativeBnWVideoView) {
        return <View style={props.style} />;
    }
    return <NativeBnWVideoView {...props} />;
}

export const isBnWVideoSupported = NativeBnWVideoView !== null;
