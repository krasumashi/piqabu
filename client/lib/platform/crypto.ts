import { Platform } from 'react-native';

export function generateUUID(): string {
    if (Platform.OS === 'web') {
        return globalThis.crypto.randomUUID();
    }
    const Crypto = require('expo-crypto');
    return Crypto.randomUUID();
}

export function getRandomBytes(length: number): Uint8Array {
    if (Platform.OS === 'web') {
        const bytes = new Uint8Array(length);
        globalThis.crypto.getRandomValues(bytes);
        return bytes;
    }
    const Crypto = require('expo-crypto');
    return Crypto.getRandomBytes(length);
}
