import { Platform } from 'react-native';

export async function getSecureItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
        try {
            localStorage.setItem(key, value);
        } catch {
            // localStorage may be unavailable in some contexts
        }
        return;
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
        return;
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.deleteItemAsync(key);
}
