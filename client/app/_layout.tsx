import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { RoomProvider, useRoomContext } from '../contexts/RoomContext';
import { SecurityProvider, useSecurity } from '../contexts/SecurityContext';
import PanicCalculator from '../components/PanicCalculator';
import BiometricLockScreen from '../components/BiometricLockScreen';
import OperatorBanner from '../components/OperatorBanner';
import SystemBanner from '../components/SystemBanner';
import LockoutOverlay from '../components/LockoutOverlay';
import UpdateBanner from '../components/UpdateBanner';
import UpdateWall from '../components/UpdateWall';

// Web Tailwind CSS
if (Platform.OS === 'web') {
    require('../global.css');
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Override DarkTheme bg to match split-sync
const PiqabuTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: '#060709',
        card: '#060709',
    },
};

export default function RootLayout() {
    const [loaded] = useFonts({
        SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    // Block screenshots & screen recording on native (FLAG_SECURE on Android)
    useEffect(() => {
        if (Platform.OS !== 'web') {
            ScreenCapture.preventScreenCaptureAsync();
        }
    }, []);

    if (!loaded) {
        return null;
    }

    return (
        <ThemeProvider value={PiqabuTheme}>
            <SecurityProvider>
                <RoomProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="index" options={{ animation: 'fade' }} />
                        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
                        <Stack.Screen name="room/index" options={{ animation: 'fade' }} />
                    </Stack>
                    <StatusBar style="light" />
                    <SecurityOverlays />
                    <SystemBannerMount />
                    <UpdateBannerMount />
                    <OperatorBannerMount />
                    <UpdateWallMount />
                    <LockoutOverlayMount />
                </RoomProvider>
            </SecurityProvider>
        </ThemeProvider>
    );
}

/* Security overlays rendered above everything */
function SecurityOverlays() {
    const { panicActive, biometricLocked, dismissPanic, authenticate } = useSecurity();
    return (
        <>
            <PanicCalculator visible={panicActive} onDismiss={dismissPanic} />
            <BiometricLockScreen visible={biometricLocked && !panicActive} onAuthenticate={authenticate} />
        </>
    );
}

// Renders the operator-reply banner globally — sits above every screen
// so the user sees replies regardless of where they are in the app.
function OperatorBannerMount() {
    const { socket } = useRoomContext();
    return <OperatorBanner socket={socket} />;
}

// Renders admin broadcasts (operator → all devices, auto-dismiss).
// Maintenance is no longer surfaced here — it's a hard lockout now,
// see LockoutOverlayMount below.
function SystemBannerMount() {
    const { adminBroadcast, dismissAdminBroadcast } = useRoomContext();
    return (
        <SystemBanner
            broadcast={adminBroadcast}
            onDismissBroadcast={dismissAdminBroadcast}
        />
    );
}

// Full-screen, undismissable overlay for maintenance mode and per-
// device blocks. Sits above EVERY other surface (zIndex 10000) — if
// either is active the user can't reach any app screen until the
// server clears it. State is mirrored to secure-store inside
// useSocketManager so the overlay also paints on a cold app start
// when the server has previously locked us out, until the next
// connect reconciles.
function LockoutOverlayMount() {
    const { maintenanceMode, maintenanceMessage, blocked, blockReason } = useRoomContext();
    return (
        <LockoutOverlay
            maintenanceMode={maintenanceMode}
            maintenanceMessage={maintenanceMessage}
            blocked={blocked}
            blockReason={blockReason}
        />
    );
}

// SOFT update notice. Slides down from the top, dismissable (per
// notice id, persistent across restarts so re-opening doesn't
// re-nag).
function UpdateBannerMount() {
    const { updateNotice, dismissedNoticeId, dismissUpdateNotice } = useRoomContext();
    return (
        <UpdateBanner
            notice={updateNotice}
            dismissedNoticeId={dismissedNoticeId}
            onDismiss={dismissUpdateNotice}
        />
    );
}

// HARD update wall. Full-screen, no dismiss. Caller's only option is
// to run the update or wait for the operator to clear the wall.
function UpdateWallMount() {
    const { updateNotice } = useRoomContext();
    return <UpdateWall notice={updateNotice} />;
}
