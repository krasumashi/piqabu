import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform, Animated as RNAnimated, TextInput, Alert, KeyboardAvoidingView, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { useSecurity } from '../contexts/SecurityContext';
import { setSecureItem, getSecureItem } from '../lib/platform/storage';
import { wipeAllPiqabuState } from '../lib/wipe';
import { useProAccess, useProTimeline } from '../lib/pro';
import { usePricing } from '../lib/payment/usePricing';
import { LEGAL_URLS } from '../lib/legal/consent';
import { CONFIG } from '../constants/Config';

/**
 * Format an ISO date as e.g. "23 SEP 2027". Locale-free and spare —
 * matches the rest of the Piqabu monospace aesthetic.
 */
function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
        return '—';
    }
}

/**
 * Open the Android system IME settings screen so the user can toggle
 * the Piqabu Keyboard on. No-op on iOS/web for v1.
 */
function openKeyboardSettings() {
    if (Platform.OS !== 'android') return;
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(() => {
        Linking.openSettings().catch(() => {});
    });
}

interface SettingsPanelProps {
    visible: boolean;
    onClose: () => void;
    roomId: string;
    linkStatus: string;
    onRegenerateKey: () => void;
    onLeaveChannel: () => void;
    onLinkDevices?: () => void;
}

export default function SettingsPanel({
    visible, onClose, roomId, linkStatus, onRegenerateKey, onLeaveChannel, onLinkDevices
}: SettingsPanelProps) {
    const { panicEnabled, biometricEnabled, setPanicEnabled, setBiometricEnabled, triggerPanic } = useSecurity();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { isPro, refresh: refreshPro } = useProAccess();
    const { timeline: proTimeline, refresh: refreshTimeline } = useProTimeline();
    const { pricing } = usePricing();

    // Refresh tier + timeline state whenever the drawer becomes visible
    // — Mission Control might have flipped tier, or a Paystack purchase
    // may have completed since last open.
    useEffect(() => {
        if (visible) {
            void refreshPro();
            void refreshTimeline();
        }
    }, [visible, refreshPro, refreshTimeline]);

    /**
     * Clear the onboarded flag and jump straight back to the onboarding
     * carousel. Used during the demo to re-show the keyboard slide.
     */
    const replayOnboarding = async () => {
        try { await setSecureItem('piqabu_onboarded', ''); } catch {}
        onClose();
        // Defer the route push so the panel can animate out cleanly.
        setTimeout(() => router.replace('/onboarding'), 200);
    };

    /**
     * "Wipe Everything" — irreversible. Clears secure store, AsyncStorage,
     * file-system cache. Returns the app to brand-new install state on
     * next launch.
     */
    const handleWipeEverything = () => {
        Alert.alert(
            'WIPE EVERYTHING?',
            'This clears your Ghost ID, every room, every preference, every cached file. There is no undo. The app will return to a brand-new install state.',
            [
                { text: 'CANCEL', style: 'cancel' },
                {
                    text: 'WIPE',
                    style: 'destructive',
                    onPress: async () => {
                        await wipeAllPiqabuState();
                        onClose();
                        // Bounce to landing — _layout will re-trigger onboarding
                        // because the onboarded flag is gone.
                        setTimeout(() => router.replace('/'), 150);
                    },
                },
            ],
        );
    };
    const slideAnim = useRef(new RNAnimated.Value(300)).current;
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;

    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [submittingParams, setSubmittingParams] = useState(false);

    const handleSendFeedback = async () => {
        if (!feedbackText.trim()) return;
        setSubmittingParams(true);
        try {
            // The Ghost ID lives in expo-secure-store under `piqabu_ghost_id`
            // — same key useSocketManager reads. Earlier this code was
            // hitting AsyncStorage with a wrong key, defaulting to
            // "unknown", which silently broke the reply pipeline: the
            // server now validates the deviceId as a UUID and rejects
            // "unknown" with a 400.
            const deviceId = await getSecureItem('piqabu_ghost_id');
            if (!deviceId) {
                throw new Error('Device identity not yet provisioned. Please try again in a moment.');
            }
            const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, message: feedbackText.trim() }),
            });
            
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            Alert.alert('Sent', 'Your report was securely delivered to Mission Control.');
            setFeedbackText('');
            setFeedbackVisible(false);
        } catch (e) {
            console.warn('[Feedback] error:', e);
            Alert.alert('Transmission Failed', 'Could not send feedback at this time. Please try again later.');
        } finally {
            setSubmittingParams(false);
        }
    };

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
            <RNAnimated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }], paddingTop: Math.max(insets.top + 10, 20) }]}>
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

                {/* Ghost Sync */}
                {isLive && onLinkDevices && (
                    <TouchableOpacity onPress={onLinkDevices} style={styles.item} activeOpacity={0.7}>
                        <Text style={styles.itemLabel}>GHOST SYNC (LINK DEVICE)</Text>
                        <Ionicons name="link-outline" size={14} color={THEME.live} />
                    </TouchableOpacity>
                )}

                {/* ── Security ── */}
                <Text style={styles.sectionLabel}>SECURITY</Text>

                <TouchableOpacity
                    onPress={() => setPanicEnabled(!panicEnabled)}
                    style={styles.item}
                    activeOpacity={0.7}
                >
                    <View style={styles.itemRow}>
                        <Ionicons name="shield-outline" size={14} color={panicEnabled ? THEME.live : THEME.muted} />
                        <Text style={styles.itemLabel}>DISCREET MODE</Text>
                    </View>
                    <Text style={[styles.itemValueBold, panicEnabled && { color: THEME.live }]}>
                        {panicEnabled ? 'ON' : 'OFF'}
                    </Text>
                </TouchableOpacity>

                {panicEnabled && (
                    <TouchableOpacity
                        onPress={() => { onClose(); triggerPanic(); }}
                        style={styles.item}
                        activeOpacity={0.7}
                    >
                        <View style={styles.itemRow}>
                            <Ionicons name="flash-outline" size={14} color={THEME.warn} />
                            <Text style={styles.itemLabel}>TEST DISCREET MODE</Text>
                        </View>
                        <Text style={[styles.itemValueBold, { color: THEME.faint }]}>
                            {__DEV__ ? 'TAP TO TRIGGER' : 'SHAKE OR TAP'}
                        </Text>
                    </TouchableOpacity>
                )}

                {Platform.OS !== 'web' && (
                    <TouchableOpacity
                        onPress={() => setBiometricEnabled(!biometricEnabled)}
                        style={styles.item}
                        activeOpacity={0.7}
                    >
                        <View style={styles.itemRow}>
                            <Ionicons name="finger-print" size={14} color={biometricEnabled ? THEME.live : THEME.muted} />
                            <Text style={styles.itemLabel}>BIOMETRIC LOCK</Text>
                        </View>
                        <Text style={[styles.itemValueBold, biometricEnabled && { color: THEME.live }]}>
                            {biometricEnabled ? 'ON' : 'OFF'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Regenerate Key */}
                <TouchableOpacity onPress={onRegenerateKey} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>REGENERATE KEY</Text>
                    <Ionicons name="refresh-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {/* ── Piqabu Pro (subscription management) ── */}
                <Text style={styles.sectionLabel}>PIQABU PRO</Text>

                <View style={styles.proSummary}>
                    <View style={styles.proSummaryRow}>
                        <Text style={styles.proSummaryLabel}>TIER</Text>
                        <Text style={[styles.proSummaryValue, isPro && { color: THEME.live }]}>
                            {isPro ? 'PRO' : 'FREE'}
                        </Text>
                    </View>
                    {isPro && proTimeline.proUntil && (
                        <View style={styles.proSummaryRow}>
                            <Text style={styles.proSummaryLabel}>RENEWS</Text>
                            <Text style={styles.proSummaryValue}>
                                {formatDate(proTimeline.proUntil)}
                            </Text>
                        </View>
                    )}
                    {isPro && proTimeline.daysUntilExpiry !== null && proTimeline.daysUntilExpiry >= 0 && (
                        <View style={styles.proSummaryRow}>
                            <Text style={styles.proSummaryLabel}>DAYS LEFT</Text>
                            <Text style={styles.proSummaryValue}>
                                {proTimeline.daysUntilExpiry}
                            </Text>
                        </View>
                    )}
                    {proTimeline.inGracePeriod && (
                        <View style={styles.proSummaryRow}>
                            <Text style={[styles.proSummaryLabel, { color: THEME.warn }]}>STATUS</Text>
                            <Text style={[styles.proSummaryValue, { color: THEME.warn }]}>
                                GRACE · {proTimeline.daysUntilHardLockout ?? 0}d
                            </Text>
                        </View>
                    )}
                </View>

                <TouchableOpacity
                    onPress={() => { onClose(); setTimeout(() => router.push('/upgrade'), 200); }}
                    style={styles.item}
                    activeOpacity={0.7}
                >
                    <View style={styles.itemRow}>
                        <Ionicons
                            name={isPro ? 'refresh-circle-outline' : 'diamond-outline'}
                            size={14}
                            color={THEME.muted}
                        />
                        <Text style={styles.itemLabel}>
                            {isPro
                                ? (proTimeline.inGracePeriod
                                    ? `RENEW NOW · ${pricing.displayPrice}`
                                    : `EXTEND ANOTHER YEAR · ${pricing.displayPrice}`)
                                : `UPGRADE TO PRO · ${pricing.displayPrice} / ${pricing.periodLabel.toUpperCase()}`}
                        </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {/* ── Piqabu Keyboard ── */}
                {Platform.OS === 'android' && (
                    <>
                        <Text style={styles.sectionLabel}>PIQABU KEYBOARD</Text>

                        <TouchableOpacity
                            onPress={() => {
                                if (isPro) openKeyboardSettings();
                                else { onClose(); setTimeout(() => router.push('/upgrade'), 200); }
                            }}
                            style={styles.item}
                            activeOpacity={0.7}
                        >
                            <View style={styles.itemRow}>
                                <Ionicons
                                    name={isPro ? 'keypad-outline' : 'lock-closed-outline'}
                                    size={14}
                                    color={THEME.muted}
                                />
                                <Text style={styles.itemLabel}>
                                    {isPro ? 'ENABLE KEYBOARD' : 'UNLOCK WITH PIQABU PRO'}
                                </Text>
                            </View>
                            <Ionicons name="arrow-forward" size={14} color={THEME.ink} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={replayOnboarding}
                            style={styles.item}
                            activeOpacity={0.7}
                        >
                            <View style={styles.itemRow}>
                                <Ionicons name="play-back-outline" size={14} color={THEME.muted} />
                                <Text style={styles.itemLabel}>SHOW WALKTHROUGH AGAIN</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={14} color={THEME.ink} />
                        </TouchableOpacity>
                    </>
                )}

                {/* ── Support ── */}
                <Text style={styles.sectionLabel}>SUPPORT</Text>

                <TouchableOpacity onPress={() => setFeedbackVisible(!feedbackVisible)} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>REPORT ISSUE / FEEDBACK</Text>
                    <Ionicons name="alert-circle-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {feedbackVisible && (
                    <View style={styles.feedbackContainer}>
                        <TextInput
                            style={styles.feedbackInput}
                            placeholder="Describe the issue or share an idea..."
                            placeholderTextColor={THEME.faint}
                            value={feedbackText}
                            onChangeText={setFeedbackText}
                            multiline
                            maxLength={800}
                        />
                        <TouchableOpacity style={styles.feedbackBtn} onPress={handleSendFeedback} disabled={submittingParams}>
                            <Text style={styles.feedbackBtnText}>{submittingParams ? 'SENDING...' : 'SEND TO MISSION CONTROL'}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Legal ── */}
                <Text style={styles.sectionLabel}>LEGAL</Text>

                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.terms).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>TERMS OF SERVICE</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.privacy).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>PRIVACY POLICY</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.refunds).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>REFUND POLICY</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.acceptableUse).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>ACCEPTABLE USE</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.lawEnforcement).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>LAW ENFORCEMENT POLICY</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URLS.transparency).catch(() => {})} style={styles.item} activeOpacity={0.7}>
                    <Text style={styles.itemLabel}>TRANSPARENCY REPORTS</Text>
                    <Ionicons name="open-outline" size={14} color={THEME.ink} />
                </TouchableOpacity>

                {/* Leave Channel */}
                <TouchableOpacity onPress={onLeaveChannel} style={styles.dangerItem} activeOpacity={0.7}>
                    <Text style={styles.dangerLabel}>LEAVE CHANNEL</Text>
                    <Ionicons name="log-out-outline" size={14} color={THEME.bad} />
                </TouchableOpacity>

                {/* Wipe Everything — destructive, with confirmation. */}
                <TouchableOpacity onPress={handleWipeEverything} style={styles.dangerItem} activeOpacity={0.7}>
                    <Text style={styles.dangerLabel}>WIPE EVERYTHING</Text>
                    <Ionicons name="trash-outline" size={14} color={THEME.bad} />
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
        // paddingTop is now dynamic via useSafeAreaInsets in the component
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
    sectionLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 9 * 0.28,
        fontWeight: '900',
        color: THEME.faint,
        textTransform: 'uppercase',
        marginTop: 8,
    },
    proSummary: {
        borderWidth: 1,
        borderColor: THEME.edge2,
        borderRadius: 10,
        padding: 12,
        marginBottom: 6,
        gap: 6,
    },
    proSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    proSummaryLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '700',
        color: THEME.faint,
    },
    proSummaryValue: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '800',
        color: THEME.ink,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
    feedbackContainer: {
        padding: 12,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.08)',
        gap: 12,
    },
    feedbackInput: {
        fontFamily: THEME.mono,
        fontSize: 11,
        color: THEME.ink,
        padding: 12,
        minHeight: 80,
        textAlignVertical: 'top',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.12)',
    },
    feedbackBtn: {
        backgroundColor: THEME.ink,
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    feedbackBtnText: {
        fontFamily: THEME.mono,
        color: '#000',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
    },
});
