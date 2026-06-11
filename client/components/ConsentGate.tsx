/**
 * ConsentGate
 *
 * First-launch (and post-Terms-revision) consent + age verification
 * overlay. Mounted globally — when the user hasn't accepted the
 * current consent version, this covers the entire app until they:
 *
 *   1. Tick "I confirm I am 18 or older."
 *   2. Tick "I agree to the Terms of Service and Privacy Policy."
 *   3. Tap AGREE & CONTINUE.
 *
 * The two-checkbox split (vs. one combined statement) is deliberate
 * — age confirmation is a separate legal representation from contract
 * acceptance, and bundling them weakens both. Quiet design, but the
 * intent is solid record-keeping if a dispute ever arises.
 *
 * After acceptance, `recordConsent()` writes `piqabu_consent_v1` and
 * a timestamp to secure-store. CURRENT_CONSENT_VERSION can be bumped
 * (e.g. 'v2') when the ToS materially changes — that will re-trigger
 * the gate with copy noting the change.
 *
 * zIndex 10001 — above LockoutOverlay (10000) and UpdateWall (9999).
 * Consent is the absolute precondition; you can't even be told you're
 * blocked until you've agreed to the framework.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { getConsentState, recordConsent, LEGAL_URLS } from '../lib/legal/consent';

export default function ConsentGate() {
    const [visible, setVisible] = useState(false);
    const [reConsent, setReConsent] = useState(false);
    const [ageOk, setAgeOk] = useState(false);
    const [tosOk, setTosOk] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        (async () => {
            const state = await getConsentState();
            if (!state.accepted) setVisible(true);
            if (state.needsReConsent) setReConsent(true);
        })();
    }, []);

    if (!visible) return null;

    const canSubmit = ageOk && tosOk && !submitting;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        await recordConsent();
        setVisible(false);
    };

    const openUrl = (url: string) => { Linking.openURL(url).catch(() => {}); };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
                <View style={styles.iconWrap}>
                    <Ionicons name="shield-checkmark-outline" size={32} color={THEME.ink} />
                </View>

                <Text style={styles.title}>
                    {reConsent ? 'WE UPDATED OUR TERMS' : 'WELCOME TO PIQABU'}
                </Text>

                <Text style={styles.body}>
                    {reConsent
                        ? 'Our Terms of Service or Privacy Policy have changed since you last agreed. Please review and re-accept before continuing.'
                        : 'Piqabu is a privacy-oriented ephemeral messaging app. Before you continue, two quick confirmations.'}
                </Text>

                <View style={styles.checkboxGroup}>
                    <Checkbox
                        value={ageOk}
                        onChange={setAgeOk}
                        label="I confirm I am 18 years of age or older."
                    />
                    <Checkbox
                        value={tosOk}
                        onChange={setTosOk}
                        label={
                            <Text style={styles.checkboxText}>
                                I have read and agree to the{' '}
                                <Text style={styles.link} onPress={() => openUrl(LEGAL_URLS.terms)}>
                                    Terms of Service
                                </Text>
                                {' '}and{' '}
                                <Text style={styles.link} onPress={() => openUrl(LEGAL_URLS.privacy)}>
                                    Privacy Policy
                                </Text>
                                .
                            </Text>
                        }
                    />
                </View>

                <TouchableOpacity
                    onPress={submit}
                    disabled={!canSubmit}
                    activeOpacity={0.85}
                    style={[styles.cta, !canSubmit && { opacity: 0.4 }]}
                >
                    <Text style={styles.ctaText}>
                        {submitting ? 'SAVING…' : 'AGREE & CONTINUE'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.linksRow}>
                    <TouchableOpacity onPress={() => openUrl(LEGAL_URLS.refunds)}>
                        <Text style={styles.linkSmall}>REFUNDS</Text>
                    </TouchableOpacity>
                    <Text style={styles.linkDivider}>·</Text>
                    <TouchableOpacity onPress={() => openUrl(LEGAL_URLS.acceptableUse)}>
                        <Text style={styles.linkSmall}>USE POLICY</Text>
                    </TouchableOpacity>
                    <Text style={styles.linkDivider}>·</Text>
                    <TouchableOpacity onPress={() => openUrl(LEGAL_URLS.lawEnforcement)}>
                        <Text style={styles.linkSmall}>LEGAL REQUESTS</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.legalFooter}>
                    A Wyetey LTD product · Ghana
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

interface CheckboxProps {
    value: boolean;
    onChange: (v: boolean) => void;
    label: React.ReactNode;
}

function Checkbox({ value, onChange, label }: CheckboxProps) {
    return (
        <TouchableOpacity
            onPress={() => onChange(!value)}
            activeOpacity={0.7}
            style={styles.checkboxRow}
        >
            <View style={[styles.checkboxBox, value && styles.checkboxBoxOn]}>
                {value && <Ionicons name="checkmark" size={14} color={THEME.bg} />}
            </View>
            {typeof label === 'string'
                ? <Text style={styles.checkboxText}>{label}</Text>
                : label}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: THEME.bg,
        zIndex: 10001,
    },
    scroll: {
        padding: 24,
        flexGrow: 1,
        justifyContent: 'center',
    },
    iconWrap: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: 'rgba(245, 243, 235, 0.06)',
        borderWidth: 1, borderColor: THEME.edge,
        alignItems: 'center', justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 22,
    },
    title: {
        fontFamily: THEME.mono,
        fontSize: 12,
        letterSpacing: 3,
        fontWeight: '900',
        color: THEME.ink,
        textAlign: 'center',
        marginBottom: 14,
    },
    body: {
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.muted,
        textAlign: 'center',
        marginBottom: 28,
    },
    checkboxGroup: {
        alignSelf: 'stretch',
        gap: 14,
        marginBottom: 24,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    checkboxBox: {
        width: 22, height: 22,
        borderWidth: 1.5,
        borderColor: THEME.edge,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(245, 243, 235, 0.04)',
    },
    checkboxBoxOn: {
        backgroundColor: THEME.ink,
        borderColor: THEME.ink,
    },
    checkboxText: {
        flex: 1,
        fontFamily: THEME.mono,
        fontSize: 12,
        lineHeight: 18,
        color: THEME.ink,
        letterSpacing: 0.3,
    },
    link: {
        color: THEME.ink,
        textDecorationLine: 'underline',
        fontWeight: '800',
    },
    cta: {
        alignSelf: 'stretch',
        backgroundColor: THEME.ink,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 20,
    },
    ctaText: {
        fontFamily: THEME.mono,
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: '900',
        color: THEME.bg,
    },
    linksRow: {
        flexDirection: 'row',
        alignSelf: 'center',
        gap: 6,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 16,
    },
    linkSmall: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: THEME.faint,
        textDecorationLine: 'underline',
    },
    linkDivider: {
        fontFamily: THEME.mono,
        fontSize: 9,
        color: THEME.faint,
    },
    legalFooter: {
        fontFamily: THEME.mono,
        fontSize: 9,
        letterSpacing: 1.2,
        color: THEME.faint,
        textAlign: 'center',
        lineHeight: 14,
    },
});
