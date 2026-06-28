/**
 * /upgrade — Support Piqabu (donation) screen.
 *
 * Piqabu is free. There is no Pro tier, no trial, no paywall. This screen
 * is a voluntary donation flow: it grants nothing and unlocks nothing —
 * it only helps keep the experiment running. The route is still named
 * `/upgrade` so existing links (Settings, deep-links) keep working without
 * a router-config change.
 *
 * Donations flow through Paystack (lib/payment/paystack.ts → startDonation),
 * which records the gift server-side so the operator can send an in-app
 * thank-you from Mission Control. The donor is identified only by their
 * Ghost ID — no account, no profile.
 */
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
    ActivityIndicator, Platform, ScrollView, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { useRoomContext } from '../contexts/RoomContext';
import { startDonation } from '../lib/payment/paystack';

// Suggested amounts in pesewas (₵1 = 100). Custom lets the user type any
// amount. These match the product decision: ₵20 / ₵50 / ₵100 + custom.
const PRESETS = [
    { label: '₵20', minor: 2000 },
    { label: '₵50', minor: 5000 },
    { label: '₵100', minor: 10000 },
];

const MIN_MINOR = 100;        // ₵1 floor
const MAX_MINOR = 1_000_000;  // ₵10,000 ceiling

export default function SupportScreen() {
    const router = useRouter();
    const { deviceId } = useRoomContext();
    const [selected, setSelected] = useState<number | null>(2000);
    const [custom, setCustom] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Resolve the effective amount: a preset, or the custom field.
    const customMinor = (() => {
        const cedis = parseFloat(custom.replace(/[^0-9.]/g, ''));
        if (!isFinite(cedis) || cedis <= 0) return null;
        return Math.round(cedis * 100);
    })();
    const amountMinor = selected ?? customMinor;
    const amountValid = amountMinor != null && amountMinor >= MIN_MINOR && amountMinor <= MAX_MINOR;

    const handleDonate = async () => {
        Keyboard.dismiss();
        setErrorMsg(null);
        if (!deviceId) {
            setErrorMsg('Identity not provisioned yet. Try again in a moment.');
            return;
        }
        if (!amountValid || amountMinor == null) {
            setErrorMsg('Enter an amount between ₵1 and ₵10,000.');
            return;
        }
        setBusy(true);
        const result = await startDonation({
            deviceId,
            amountMinor,
            email: email.trim() || undefined,
        });
        setBusy(false);

        if (result.kind === 'success') {
            Alert.alert(
                'THANK YOU',
                'Your support keeps Piqabu alive and free. It means a lot.',
                [{ text: 'CLOSE', onPress: () => router.back() }],
            );
            return;
        }
        if (result.kind === 'error') {
            setErrorMsg(result.reason || 'Could not complete the donation. Please try again.');
        }
        // 'cancelled' — silent.
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={THEME.muted} />
                </TouchableOpacity>
                <Text style={styles.headerLabel}>SUPPORT</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.iconWrap}>
                    <Ionicons name="heart" size={34} color="#E5484D" />
                </View>

                <Text style={styles.title}>SUPPORT PIQABU</Text>

                <Text style={styles.tagline}>
                    Piqabu is free — and stays free for everyone who uses it.
                    {'\n\n'}
                    It's an experimental study in privacy by AhTohMoh, built in Ghana. No ads, no tracking, nothing about you to sell.
                    {'\n\n'}
                    If it's been useful to you, a donation helps keep Piqabu alive and funds the next experiments in privacy and anti-surveillance.
                    {'\n\n'}
                    Give what feels right. Nothing unlocks.
                </Text>

                {/* Preset amount chips */}
                <View style={styles.chipRow}>
                    {PRESETS.map((p) => {
                        const active = selected === p.minor;
                        return (
                            <TouchableOpacity
                                key={p.minor}
                                onPress={() => { setSelected(p.minor); setCustom(''); setErrorMsg(null); }}
                                activeOpacity={0.8}
                                style={[styles.chip, active && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Custom amount */}
                <View style={styles.customGroup}>
                    <Text style={styles.fieldLabel}>OR ENTER AN AMOUNT</Text>
                    <View style={[styles.customField, selected === null && custom !== '' && styles.customFieldActive]}>
                        <Text style={styles.currencyMark}>₵</Text>
                        <TextInput
                            value={custom}
                            onChangeText={(t) => { setCustom(t); setSelected(null); setErrorMsg(null); }}
                            placeholder="Custom"
                            placeholderTextColor={THEME.faint}
                            keyboardType="numeric"
                            editable={!busy}
                            style={styles.customInput}
                        />
                    </View>
                </View>

                {/* Optional email for receipt */}
                <View style={styles.emailGroup}>
                    <Text style={styles.fieldLabel}>EMAIL (OPTIONAL — FOR PAYSTACK RECEIPT)</Text>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Leave blank to stay anonymous"
                        placeholderTextColor={THEME.faint}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        editable={!busy}
                        style={styles.emailInput}
                    />
                </View>

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                <TouchableOpacity
                    onPress={handleDonate}
                    disabled={busy || !amountValid}
                    activeOpacity={0.85}
                    style={[styles.cta, (busy || !amountValid) && styles.ctaDisabled]}
                >
                    {busy ? (
                        <ActivityIndicator color={THEME.bg} size="small" />
                    ) : (
                        <Text style={styles.ctaText}>
                            {amountValid && amountMinor != null
                                ? `DONATE ₵${(amountMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                : 'CHOOSE AN AMOUNT'}
                        </Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.legalText}>
                    Handled securely by Paystack.{Platform.OS === 'android' ? ' Mobile money and card accepted.' : ''}
                </Text>
            </ScrollView>
        </SafeAreaView>
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
    closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerLabel: {
        fontFamily: THEME.mono, fontSize: 10, letterSpacing: 3,
        fontWeight: '800', color: THEME.muted,
    },
    body: {
        flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32,
        alignItems: 'center',
    },
    iconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(245, 243, 235, 0.06)',
        borderWidth: 1, borderColor: THEME.edge,
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    title: {
        fontFamily: THEME.mono, fontSize: 13, letterSpacing: 4,
        fontWeight: '900', color: THEME.ink, marginBottom: 14,
    },
    tagline: {
        fontFamily: THEME.mono, fontSize: 12, lineHeight: 18,
        color: THEME.muted, textAlign: 'center', maxWidth: 360, marginBottom: 24,
    },
    chipRow: {
        flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginBottom: 16,
    },
    chip: {
        flex: 1, paddingVertical: 16, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(245,243,235,0.035)',
        alignItems: 'center', justifyContent: 'center',
    },
    chipActive: {
        borderColor: THEME.ink, backgroundColor: 'rgba(245,243,235,0.12)',
    },
    chipText: {
        fontFamily: THEME.mono, fontSize: 15, fontWeight: '900',
        letterSpacing: 1, color: THEME.muted,
    },
    chipTextActive: { color: THEME.ink },
    customGroup: { alignSelf: 'stretch', marginBottom: 18 },
    fieldLabel: {
        fontFamily: THEME.mono, fontSize: 9, letterSpacing: 2,
        fontWeight: '800', color: THEME.faint, marginBottom: 6,
    },
    customField: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: THEME.paper, borderWidth: 1, borderColor: THEME.edge,
        borderRadius: 12, paddingHorizontal: 12,
    },
    customFieldActive: { borderColor: THEME.ink },
    currencyMark: {
        fontFamily: THEME.mono, fontSize: 18, color: THEME.muted, marginRight: 6,
    },
    customInput: {
        flex: 1, paddingVertical: 12,
        fontFamily: THEME.mono, fontSize: 16, color: THEME.ink,
    },
    emailGroup: { alignSelf: 'stretch', marginBottom: 18 },
    emailInput: {
        backgroundColor: THEME.paper, borderWidth: 1, borderColor: THEME.edge,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        fontFamily: THEME.mono, fontSize: 13, color: THEME.ink,
    },
    errorText: {
        fontFamily: THEME.mono, fontSize: 11, color: THEME.warn,
        lineHeight: 16, marginBottom: 12, textAlign: 'center',
    },
    cta: {
        alignSelf: 'stretch', backgroundColor: THEME.ink,
        paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 14,
    },
    ctaDisabled: {
        backgroundColor: 'rgba(245, 243, 235, 0.10)',
        borderWidth: 1, borderColor: THEME.edge2,
    },
    ctaText: {
        fontFamily: THEME.mono, fontSize: 12, letterSpacing: 2,
        fontWeight: '900', color: THEME.bg,
    },
    legalText: {
        fontFamily: THEME.mono, fontSize: 10, lineHeight: 14,
        color: THEME.faint, textAlign: 'center', letterSpacing: 0.3, maxWidth: 360,
    },
});
