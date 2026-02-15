import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { RoomProvider } from '../contexts/RoomContext';

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

    if (!loaded) {
        return null;
    }

    return (
        <ThemeProvider value={PiqabuTheme}>
            <RoomProvider>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" options={{ animation: 'fade' }} />
                    <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
                    <Stack.Screen name="room/index" options={{ animation: 'fade' }} />
                </Stack>
                <StatusBar style="light" />
            </RoomProvider>
        </ThemeProvider>
    );
}
