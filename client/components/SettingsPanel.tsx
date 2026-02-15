import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

interface SettingsPanelProps {
    visible: boolean;
    onClose: () => void;
    roomId: string;
    linkStatus: string;
    onRegenerateKey: () => void;
    onLeaveChannel: () => void;
}

export default function SettingsPanel({
    visible, onClose, roomId, linkStatus, onRegenerateKey, onLeaveChannel,
}: SettingsPanelProps) {
    const slideAnim = useRef(new RNAnimated.Value(300)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            RNAnimated.parallel([
                RNAnimated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        } else {
            RNAnimated.parallel([
                RNAnimated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
                RNAnimated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const handleShareKey = async () => {
        if (Platform.OS === 'web') {
            try {
                await navigator.clipboard.writeText(roomId);
            } catch {}
        } else {
            try {
                await Share.share({ message: `Join my Piqabu session: ${roomId}` });
            } catch {}
        }
    };

    const isLive = linkStatus === 'LINKED';

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Backdrop */}
            <RNAnimated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </RNAnimated.View>

            {/* Drawer */}
            <RNAnimated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
                {/* Header */}
                <View style={styles.drawerHeader}>
                    <Text style={styles.drawerTitle}>SETTINGS</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                        <Text style={styles.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                {/* Channel Key */}
                <View style={styles.item}>
                    <Text style={styles.itemLabel}>CHANNEL KEY</Text>
                    <Text style={styles.itemValueBold}>{roomId || '---'}</Text>
                </View>

                {/* Share Key */}
                <TouchableOpacity onPress={handleShareKey} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>SHARE KEY</Text>
                    <Ionicons name="link-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {/* Status */}
                <View style={styles.item}>
                    <Text style={styles.itemLabel}>STATUS</Text>
                    <Text style={[styles.itemValueBold, { color: isLive ? THEME.live : THEME.warn }]}>
                        {isLive ? 'LIVE' : 'WAITING'}
                    </Text>
                </View>

                {/* Regenerate Key */}
                <TouchableOpacity onPress={onRegenerateKey} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>REGENERATE KEY</Text>
                    <Ionicons name="refresh-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {/* Leave Channel */}
                <TouchableOpacity onPress={onLeaveChannel} style={styles.dangerItem} activeOpacity={0.7}>
                    <Text style={styles.dangerLabel}>LEAVE CHANNEL</Text>
                    <Ionicons name="log-out-outline" size={14} color={THEME.bad} />
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.drawerFooter}>
                    <Text style={styles.footerText}>NO ACCOUNTS. NO HISTORY.</Text>
                </View>
            </RNAnimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 90,
    },
    drawer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 300,
        maxWidth: '85%',
        backgroundColor: 'rgba(15,17,20,0.96)',
        borderLeftWidth: 1,
        borderLeftColor: THEME.edge,
        zIndex: 100,
        padding: 18,
        paddingTop: 50,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: -10, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 20,
    },
    drawerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    drawerTitle: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 11 * 0.28,
        textTransform: 'uppercase',
        color: THEME.muted,
        fontWeight: '900',
    },
    closeBtn: {
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.20)',
        backgroundColor: 'transparent',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 12,
    },
    closeBtnText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.22,
        fontWeight: '900',
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    itemLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.14,
        color: THEME.muted,
        textTransform: 'uppercase',
    },
    itemValueBold: {
        fontFamily: THEME.mono,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 10 * 0.18,
        color: THEME.ink,
        textTransform: 'uppercase',
    },
    dangerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(120,120,120,0.4)',
        backgroundColor: 'rgba(120,120,120,0.05)',
    },
    dangerLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.14,
        color: THEME.bad,
        textTransform: 'uppercase',
    },
    drawerFooter: {
        marginTop: 'auto',
        paddingVertical: 6,
    },
    footerText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.12,
        color: THEME.faint,
        lineHeight: 16,
        textTransform: 'uppercase',
    },
});
