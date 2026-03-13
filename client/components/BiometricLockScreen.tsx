import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

interface BiometricLockScreenProps {
    visible: boolean;
    onAuthenticate: () => Promise<boolean>;
}

export default function BiometricLockScreen({ visible, onAuthenticate }: BiometricLockScreenProps) {
    // Auto-prompt on mount
    useEffect(() => {
        if (visible && Platform.OS !== 'web') {
            const timer = setTimeout(() => onAuthenticate(), 500);
            return () => clearTimeout(timer);
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            statusBarTranslucent
            hardwareAccelerated
        >
            <StatusBar style="light" />
            <View style={s.container}>
                <View style={s.content}>
                    <View style={s.iconRing}>
                        <Ionicons name="finger-print" size={56} color="rgba(245,243,235,0.85)" />
                    </View>
                    <Text style={s.title}>LOCKED</Text>
                    <Text style={s.subtitle}>AUTHENTICATE TO ACCESS</Text>
                    <TouchableOpacity style={s.btn} onPress={onAuthenticate} activeOpacity={0.7}>
                        <Ionicons name="lock-open-outline" size={18} color="#000" />
                        <Text style={s.btnText}>UNLOCK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#060709',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        alignItems: 'center',
        gap: 20,
    },
    iconRing: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: 'rgba(245,243,235,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'SpaceMono',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 6,
        color: 'rgba(245,243,235,0.92)',
        textTransform: 'uppercase',
    },
    subtitle: {
        fontFamily: 'SpaceMono',
        fontSize: 10,
        letterSpacing: 2.5,
        color: 'rgba(245,243,235,0.38)',
        textTransform: 'uppercase',
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 24,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 16,
        backgroundColor: 'rgba(245,243,235,0.85)',
    },
    btnText: {
        fontFamily: 'SpaceMono',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#000',
        textTransform: 'uppercase',
    },
});
