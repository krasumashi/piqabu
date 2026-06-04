/**
 * Deep-link landing route for the Piqabu share-link.
 *
 * Mounted by expo-router when a user opens `https://piqabu.live/j/CODE`
 * (either by tapping a WhatsApp message or via the Piqabu Keyboard's
 * MINT firing Intent.ACTION_VIEW with setPackage(self)).
 *
 * This screen is a brief bridge — it adds the room to the context and
 * redirects to `/room` so the existing room screen (with its handshake
 * + chat UI) takes over.
 *
 * We wait for `hydrated` before adding, because if the app is being
 * cold-started from the deep link the RoomManager is still rehydrating
 * persisted state and `addRoom` would race the restoration.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRoomContext } from '../../contexts/RoomContext';
import { THEME } from '../../constants/Theme';

export default function JoinByCode() {
    const { code } = useLocalSearchParams<{ code: string }>();
    const router = useRouter();
    const { addRoom, hydrated } = useRoomContext();
    const acted = useRef(false);

    useEffect(() => {
        if (!hydrated || acted.current) return;
        const raw = String(code ?? '').trim().toUpperCase();
        // Server's code alphabet (A-Z minus I,O + digits 2-9), 6 chars.
        if (!/^[A-HJ-NP-Z2-9]{6}$/.test(raw)) {
            // Malformed link — bounce to landing.
            acted.current = true;
            router.replace('/');
            return;
        }
        acted.current = true;
        // Mark this room as deep-link origin so the room screen knows to
        // show the handshake/waiting screen as the first frame. Rooms
        // added from the landing screen's Generate flow stay 'manual'
        // and skip straight to the chat UI.
        addRoom(raw, 'deeplink');
        router.replace('/room');
    }, [hydrated, code]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="small" color={THEME.ink} />
            <Text style={styles.label}>OPENING CHANNEL…</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: THEME.bg,
        gap: 18,
    },
    label: {
        fontFamily: THEME.mono,
        color: THEME.muted,
        fontSize: 10,
        letterSpacing: 2.5,
        fontWeight: '600',
    },
});
