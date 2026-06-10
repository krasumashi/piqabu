/**
 * /upgrade — Piqabu Pro purchase screen.
 *
 * Reached three ways:
 *   - Tapping the keyboard paywall overlay (deep-link to
 *     https://piqabu.live/upgrade, see PiqabuKeyboardService.launchPaywall).
 *   - Tapping "Get Pro" from the in-app paywall in Settings / onboarding.
 *   - Following the renew-soon nudge during the 14-day grace period
 *     (not yet wired — Phase 2).
 *
 * One purchase: $25 USD, grants 1 year of Pro entitlement. After 12
 * months we surface a renew prompt; user has a 14-day grace before the
 * keyboard re-locks.
 *
 * Privacy: email is optional. Empty → server synthesizes a placeholder
 * from the Ghost ID. Piqabu never persists the email beyond the in-flight
 * transaction; the receipt (such as it is) lives on Paystack's side.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { useRoomContext } from '../contexts/RoomContext';
import { startCheckout } from '../lib/payment/paystack';
import { usePricing } from '../lib/payment/usePricing';
import { setProAccess, syncProAccessFromServer } from '../lib/pro';

export default function UpgradeScreen() {
    const router = useRouter();
    const { deviceId } = useRoomContext();
    const { pricing } = usePricing();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // If we land here while already Pro, just close — the screen would
    // otherwise let a user accidentally re-buy.
    useEffect(() => {
        let active = true;
        (async () => {
            if (!deviceId) return;
            try {
                await syncProAccessFromServer(deviceId);
            } catch { /* noop */ }
        })();
        return () => { active = false; void active; };
    }, [deviceId]);

    const handleBuy = async () => {
        if (!deviceId) {
            setErrorMsg('Identity not provisioned yet. Try again in a moment.');
            return;
        }
        setBusy(true);
        setErrorMsg(null);

        const result = await startCheckout({
            deviceId,
            email: email.trim() || undefined,
        });

        if (result.kind === 'success') {
            await setProAccess(true, { proUntil: result.proUntil ?? null, graceUntil: null });
            setBusy(false);
            // Tiny confirmation, then exit. We don't celebrate too hard —
            // Piqabu's tone is spare.
            Alert.alert('PRO ACTIVATED', 'Thank you. Your Pro access is live for one year.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
            return;
        }

        setBusy(false);
        if (result.kind === 'pending') {
            setErrorMsg('Payment received but not yet confirmed. We\'ll unlock Pro shortly — keep the app open for a minute, or relaunch.');
            return;
        }
        if (result.kind === 'error') {
            setErrorMsg(result.reason || 'Could not complete the purchase. Please try again.');
            return;
        }
        // 'cancelled' — silent. User dismissed; no error needed.
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={THEME.muted} />
                </TouchableOpacity>
                <Text style={styles.headerLabel}>UPGRADE</Text>
                <View style={{ width: 32 }} />
            </View>

            <View style={styles.body}>
                <View style={styles.iconWrap}>
                    <Ionicons name="diamond-outline" size={36} color={THEME.ink} />
                </View>

                <Text style={styles.title}>PIQABU PRO</Text>
                <Text style={styles.tagline}>One year of the private keyboard, multi-room, and everything to come.</Text>

                <View style={styles.priceRow}>
                    <Text style={styles.priceSymbol}>{pricing.displaySymbol}</Text>
                    <Text style={styles.priceNumber}>
                        {(pricing.amount / 100).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                        })}
                    </Text>
                    <Text style={styles.pricePeriod}>/{pricing.periodLabel}</Text>
                </View>

                <View style={styles.benefitsList}>
                    <Benefit label="Piqabu Keyboard — Private, no telemetry, ZeroTrace typing." />
                    <Benefit label="Multi-room — up to 5 simultaneous channels." />
                    <Benefit label="Decoy Send, Quick-Lock, Ghost Paste, full toolset." />
                    <Benefit label="Direct line to the helpdesk in-app." />
                </View>

                <View style={styles.emailGroup}>
                    <Text style={styles.emailLabel}>EMAIL (OPTIONAL — FOR PAYSTACK RECEIPT)</Text>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Leave blank for anonymous"
                        placeholderTextColor={THEME.faint}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        editable={!busy}
                        style={styles.emailInput}
                    />
                    <Text style={styles.emailFootnote}>
                        Piqabu doesn't store this. Paystack uses it for the receipt only.
                    </Text>
                </View>

                {errorMsg && (
                    <Text style={styles.errorText}>{errorMsg}</Text>
                )}

                <TouchableOpacity
                    onPress={handleBuy}
                    disabled={busy}
                    activeOpacity={0.85}
                    style={[styles.cta, busy && { opacity: 0.5 }]}
                >
                    {busy ? (
                        <ActivityIndicator color={THEME.bg} size="small" />
                    ) : (
                        <Text style={styles.ctaText}>CONTINUE TO PAYSTACK · {pricing.displayPrice}</Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.legalText}>
                    Secure payment by Paystack. One-time charge of {pricing.displayPrice} grants 1 year of Piqabu Pro.
                    {Platform.OS === 'android' ? '\nA 14-day grace period applies before access locks at renewal.' : ''}
                </Text>
            </View>
        </SafeAreaView>
    );
}

function Benefit({ label }: { label: string }) {
    return (
        <View style={styles.benefitRow}>
            <Ionicons name="ellipse" size={5} color={THEME.muted} style={{ marginTop: 7 }} />
            <Text style={styles.benefitText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: THEME.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    closeBtn: {
        width: 32, height: 32,
        alignItems: 'center', justifyContent: 'center',
    },
    headerLabel: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 3,
        fontWeight: '800',
        color: THEME.muted,
    },
    body: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 16,
        alignItems: 'center',
    },
    iconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(245, 243, 235, 0.06)',
        borderWidth: 1, borderColor: THEME.edge,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 13,
        letterSpacing: 4,
        fontWeight: '900',
        color: THEME.ink,
        marginBottom: 8,
    },
    tagline: {
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.muted,
        textAlign: 'center',
        maxWidth: 320,
        marginBottom: 20,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 18,
    },
    priceSymbol: {
        fontFamily: THEME.mono,
        fontSize: 18,
        color: THEME.muted,
        marginRight: 2,
    },
    priceNumber: {
        fontFamily: THEME.mono,
        fontSize: 48,
        fontWeight: '900',
        color: THEME.ink,
        letterSpacing: -1,
    },
    pricePeriod: {
        fontFamily: THEME.mono,
        fontSize: 12,
        color: THEME.muted,
        marginLeft: 4,
        letterSpacing: 1,
    },
    benefitsList: {
        alignSelf: 'stretch',
        marginBottom: 22,
        gap: 8,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    benefitText: {
        flex: 1,
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.ink,
        letterSpacing: 0.3,
    },
    emailGroup: {
        alignSelf: 'stretch',
        marginBottom: 18,
    },
    emailLabel: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: '800',
        color: THEME.faint,
        marginBottom: 6,
    },
    emailInput: {
        backgroundColor: THEME.paper,
        borderWidth: 1,
        borderColor: THEME.edge,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: THEME.mono,
        fontSize: 13,
        color: THEME.ink,
        marginBottom: 6,
    },
    emailFootnote: {
        fontFamily: THEME.mono,
        fontSize: 10,
        color: THEME.faint,
        lineHeight: 14,
    },
    errorText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        color: THEME.warn,
        lineHeight: 16,
        marginBottom: 12,
        textAlign: 'center',
    },
    cta: {
        alignSelf: 'stretch',
        backgroundColor: THEME.ink,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 14,
    },
    ctaText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
    legalText: {
        fontFamily: THEME.mono,
        fontSize: 10,
        lineHeight: 14,
        color: THEME.faint,
        textAlign: 'center',
        letterSpacing: 0.3,
    },
});
