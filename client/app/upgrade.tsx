/**
 * /upgrade — Piqabu Pro screen.
 *
 * Context-aware state machine. The same route serves five distinct
 * user states, each with its own copy and CTA:
 *
 *   FREE     — never been Pro. Standard upgrade pitch.
 *   TRIAL    — currently on the 3-day free trial. "Convert before the
 *              trial ends" framing. CTA: GO PRO.
 *   PRO      — paid Pro, healthy. Renew framing showing current
 *              expiry + what renewal extends to. CTA: EXTEND.
 *   GRACE    — paid Pro, in the 14-day grace window. Urgent renew
 *              framing with days-until-lockout. CTA: RENEW NOW.
 *   PENDING  — checkout in flight (server has a paystackPendingReference
 *              that hasn't activated yet). CTA disabled, copy says
 *              "Confirming with Paystack." Listens for the
 *              subscription_updated socket event to auto-confirm when
 *              the webhook lands — typical for MTN MoMo, where the
 *              user submits on Paystack then approves on phone several
 *              minutes later.
 *
 * The state is derived from a /status fetch on mount + after the
 * checkout webview closes. The subscription_updated socket listener
 * pushes us to success if the webhook fires while we're still on the
 * screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
    ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../constants/Theme';
import { useRoomContext } from '../contexts/RoomContext';
import {
    startCheckout as startPaystackCheckout,
    fetchSubscriptionStatus,
    isPendingFresh,
    type StatusResponse,
} from '../lib/payment/paystack';
import { startAppleCheckout } from '../lib/payment/appleIap';
import { usePricing } from '../lib/payment/usePricing';
import { setProAccess, syncProAccessFromServer } from '../lib/pro';

type UserState = 'free' | 'trial' | 'pro' | 'grace' | 'pending' | 'loading';

function deriveState(status: StatusResponse | null): UserState {
    if (!status) return 'loading';
    if (isPendingFresh(status)) return 'pending';
    if (status.inGracePeriod) return 'grace';
    if (status.tier === 'pro' && status.source === 'trial') return 'trial';
    if (status.tier === 'pro') return 'pro';
    return 'free';
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return '—'; }
}

function daysUntil(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!isFinite(ms)) return null;
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function UpgradeScreen() {
    const router = useRouter();
    const { deviceId, socket } = useRoomContext();
    const { pricing } = usePricing();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        if (!deviceId) return;
        const s = await fetchSubscriptionStatus(deviceId);
        setStatus(s);
    }, [deviceId]);

    // Pull canonical state on mount + every 8 seconds while we're on
    // this screen (catches the webhook landing while the user reads).
    useEffect(() => {
        refreshStatus();
        const id = setInterval(refreshStatus, 8000);
        return () => clearInterval(id);
    }, [refreshStatus]);

    // Real-time activation: when the server's webhook lands, useSocketManager
    // fires subscription_updated. Refresh status so the screen pops to
    // SUCCESS without the user having to do anything.
    useEffect(() => {
        if (!socket) return;
        const onUpdate = () => { void refreshStatus(); };
        socket.on('subscription_updated', onUpdate);
        return () => { socket.off('subscription_updated', onUpdate); };
    }, [socket, refreshStatus]);

    // When the server reports paid Pro state (source='paystack' OR
    // 'apple_iap'), mirror to local secure-store so the IME paywall
    // drops and Settings reflects immediately.
    useEffect(() => {
        if (!deviceId || !status) return;
        if (status.tier === 'pro' && (status.source === 'paystack' || status.source === 'apple_iap')) {
            void setProAccess(true, {
                proUntil: status.proUntil,
                graceUntil: status.graceUntil ?? null,
                source: status.source,
            });
            void syncProAccessFromServer(deviceId);
        }
    }, [status, deviceId]);

    const userState = deriveState(status);

    const handleBuy = async () => {
        if (!deviceId) {
            setErrorMsg('Identity not provisioned yet. Try again in a moment.');
            return;
        }
        setBusy(true);
        setErrorMsg(null);

        const result = Platform.OS === 'ios'
            ? await startAppleCheckout({ deviceId })
            : await startPaystackCheckout({ deviceId, email: email.trim() || undefined });

        // Always refresh status after the webview closes — the server
        // may have learned about the payment during the poll cycle even
        // if our local CheckoutResult says 'cancelled'.
        await refreshStatus();
        setBusy(false);

        if (result.kind === 'success') {
            Alert.alert('PRO ACTIVATED', 'Thank you. Your Pro access is live for one year.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
            return;
        }
        if (result.kind === 'pending') {
            // The pending state will now render via userState — no error
            // message needed. The screen will auto-promote to success
            // when the webhook lands and refreshStatus picks it up.
            return;
        }
        if (result.kind === 'error') {
            setErrorMsg(result.reason || 'Could not complete the purchase. Please try again.');
            return;
        }
        // 'cancelled' — silent.
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={THEME.muted} />
                </TouchableOpacity>
                <Text style={styles.headerLabel}>
                    {userState === 'pro' || userState === 'grace' ? 'RENEW' : 'UPGRADE'}
                </Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.iconWrap}>
                    <Ionicons
                        name={userState === 'pending' ? 'hourglass-outline'
                            : userState === 'grace' ? 'alert-circle-outline'
                            : 'diamond-outline'}
                        size={36}
                        color={userState === 'grace' ? THEME.warn : THEME.ink}
                    />
                </View>

                <Text style={styles.title}>PIQABU PRO</Text>

                {/* Context line — different per user state. */}
                {userState === 'loading' && (
                    <Text style={styles.tagline}>Loading your status…</Text>
                )}
                {userState === 'free' && (
                    <Text style={styles.tagline}>
                        One year of the private keyboard and everything to come.
                    </Text>
                )}
                {userState === 'trial' && (
                    <Text style={styles.tagline}>
                        You're on the 3-day free trial — {daysUntil(status?.proUntil) ?? 0} day{daysUntil(status?.proUntil) === 1 ? '' : 's'} left.
                        {'\n'}Upgrade now to keep Pro running when the trial ends.
                    </Text>
                )}
                {userState === 'pro' && (
                    <Text style={styles.tagline}>
                        You're Pro until {formatDate(status?.proUntil)}.
                        {'\n'}Renewing now extends Pro by another year.
                    </Text>
                )}
                {userState === 'grace' && (
                    <Text style={[styles.tagline, { color: THEME.warn }]}>
                        Your Pro expired on {formatDate(status?.proUntil)}.
                        {'\n'}{daysUntil(status?.graceUntil) ?? 0} days left in the grace window before access locks.
                    </Text>
                )}
                {userState === 'pending' && (
                    <Text style={styles.tagline}>
                        Your payment is being processed.
                        {'\n'}Pro will activate as soon as Paystack confirms with your bank or mobile money provider.
                    </Text>
                )}

                {/* Price tag — hide on pending and on a healthy paid Pro
                    state (where the renew context already conveys cost
                    in the CTA). Show on trial and free as the headline. */}
                {(userState === 'free' || userState === 'trial' || userState === 'grace') && (
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
                )}

                {/* Status card for paid + grace + pending — supplements
                    the tagline with structured facts. */}
                {(userState === 'pro' || userState === 'grace' || userState === 'pending') && (
                    <View style={styles.statusCard}>
                        <StatusRow label="TIER" value="PRO" valueColor={THEME.live} />
                        {status?.proUntil && (
                            <StatusRow
                                label={userState === 'grace' ? 'EXPIRED' : 'RENEWS'}
                                value={formatDate(status.proUntil)}
                            />
                        )}
                        {userState === 'pending' && (
                            <StatusRow
                                label="STATUS"
                                value="CONFIRMING"
                                valueColor={THEME.warn}
                            />
                        )}
                        {userState === 'grace' && (
                            <StatusRow
                                label="LOCKS IN"
                                value={`${daysUntil(status?.graceUntil) ?? 0}d`}
                                valueColor={THEME.warn}
                            />
                        )}
                    </View>
                )}

                {/* Benefits — relevant only when prospecting (free/trial). */}
                {(userState === 'free' || userState === 'trial') && (
                    <View style={styles.benefitsList}>
                        <Benefit label="Piqabu Keyboard — private, no telemetry, ZeroTrace typing." />
                        <Benefit label="Decoy Send, Quick-Lock, Ghost Paste, full toolset." />
                        <Benefit label="Direct line to the helpdesk in-app." />
                    </View>
                )}

                {/* Email field — Paystack-only, hidden on iOS + pending. */}
                {Platform.OS !== 'ios' && userState !== 'pending' && userState !== 'loading' && (
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
                )}

                {errorMsg && (
                    <Text style={styles.errorText}>{errorMsg}</Text>
                )}

                {/* CTA — label + behaviour vary per state. */}
                <TouchableOpacity
                    onPress={handleBuy}
                    disabled={busy || userState === 'pending' || userState === 'loading'}
                    activeOpacity={0.85}
                    style={[
                        styles.cta,
                        (userState === 'pending' || userState === 'loading' || busy) && styles.ctaDisabled,
                        userState === 'grace' && styles.ctaGrace,
                    ]}
                >
                    {busy ? (
                        <ActivityIndicator color={THEME.bg} size="small" />
                    ) : (
                        <Text style={[
                            styles.ctaText,
                            userState === 'pending' && { color: THEME.muted },
                        ]}>
                            {ctaLabel(userState, pricing.displayPrice)}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Legal / footnote line. */}
                {userState !== 'pending' && userState !== 'loading' && (
                    <Text style={styles.legalText}>
                        Secure payment by {Platform.OS === 'ios' ? 'Apple' : 'Paystack'}. One-time charge of {pricing.displayPrice} grants 1 year of Piqabu Pro.
                        {Platform.OS === 'android' ? '\nA 14-day grace period applies before access locks at renewal.' : ''}
                    </Text>
                )}
                {userState === 'pending' && (
                    <Text style={styles.legalText}>
                        Paystack is finalising your transaction. This typically takes under a minute, but mobile money can take a few minutes if you need to approve on your phone.{'\n\n'}
                        You can close this screen — we'll activate Pro automatically as soon as the payment is confirmed.
                    </Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function ctaLabel(state: UserState, price: string): string {
    if (Platform.OS === 'ios') return 'CONTINUE WITH APP STORE';
    switch (state) {
        case 'loading':  return 'LOADING…';
        case 'pending':  return 'CONFIRMING WITH PAYSTACK…';
        case 'grace':    return `RENEW NOW · ${price}`;
        case 'pro':      return `EXTEND ANOTHER YEAR · ${price}`;
        case 'trial':    return `GO PRO · ${price}`;
        case 'free':
        default:         return `CONTINUE TO PAYSTACK · ${price}`;
    }
}

function StatusRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{label}</Text>
            <Text style={[styles.statusValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

function Benefit({ label }: { label: string }) {
    return (
        <View style={styles.benefitRow}>
            <View style={styles.benefitCell}>
                <Ionicons name="checkmark" size={16} color={THEME.ink} />
            </View>
            <View style={[styles.benefitCell, styles.benefitTextCell]}>
                <Text style={styles.benefitText}>{label}</Text>
            </View>
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
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 24,
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
        maxWidth: 340,
        marginBottom: 20,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 18,
    },
    priceSymbol: {
        fontFamily: THEME.mono, fontSize: 18, color: THEME.muted, marginRight: 2,
    },
    priceNumber: {
        fontFamily: THEME.mono, fontSize: 48, fontWeight: '900',
        color: THEME.ink, letterSpacing: -1,
    },
    pricePeriod: {
        fontFamily: THEME.mono, fontSize: 12, color: THEME.muted,
        marginLeft: 4, letterSpacing: 1,
    },
    statusCard: {
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: THEME.edge2,
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        gap: 8,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusLabel: {
        fontFamily: THEME.mono, fontSize: 9, letterSpacing: 2,
        color: THEME.faint, fontWeight: '700',
    },
    statusValue: {
        fontFamily: THEME.mono, fontSize: 11, letterSpacing: 1,
        color: THEME.ink, fontWeight: '800',
    },
    benefitsList: {
        alignSelf: 'stretch',
        marginBottom: 22,
        gap: 7,
    },
    benefitRow: {
        flexDirection: 'row', alignItems: 'stretch', gap: 7,
    },
    benefitCell: {
        width: 44,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(245,243,235,0.035)',
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    benefitTextCell: {
        flex: 1,
        width: undefined,
        alignItems: 'flex-start',
        paddingVertical: 11,
        paddingHorizontal: 14,
    },
    benefitText: {
        fontFamily: THEME.mono, fontSize: 12, lineHeight: 18,
        color: THEME.ink, letterSpacing: 0.3,
    },
    emailGroup: { alignSelf: 'stretch', marginBottom: 18 },
    emailLabel: {
        fontFamily: THEME.mono, fontSize: 9, letterSpacing: 2,
        fontWeight: '800', color: THEME.faint, marginBottom: 6,
    },
    emailInput: {
        backgroundColor: THEME.paper, borderWidth: 1, borderColor: THEME.edge,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        fontFamily: THEME.mono, fontSize: 13, color: THEME.ink, marginBottom: 6,
    },
    emailFootnote: {
        fontFamily: THEME.mono, fontSize: 10, color: THEME.faint, lineHeight: 14,
    },
    errorText: {
        fontFamily: THEME.mono, fontSize: 11, color: THEME.warn,
        lineHeight: 16, marginBottom: 12, textAlign: 'center',
    },
    cta: {
        alignSelf: 'stretch', backgroundColor: THEME.ink,
        paddingVertical: 14, borderRadius: 12,
        alignItems: 'center', marginBottom: 14,
    },
    ctaDisabled: {
        backgroundColor: 'rgba(245, 243, 235, 0.10)',
        borderWidth: 1, borderColor: THEME.edge2,
    },
    ctaGrace: {
        backgroundColor: THEME.warn,
    },
    ctaText: {
        fontFamily: THEME.mono, fontSize: 11, letterSpacing: 2,
        fontWeight: '900', color: THEME.bg,
    },
    legalText: {
        fontFamily: THEME.mono, fontSize: 10, lineHeight: 14,
        color: THEME.faint, textAlign: 'center', letterSpacing: 0.3,
        maxWidth: 360,
    },
});
