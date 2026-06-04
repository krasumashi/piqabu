import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import * as Crypto from 'expo-crypto';

/**
 * Listens for the server's `partner_handshake` event (emitted when a room
 * reaches 2 participants) and derives a four-glyph mutual fingerprint
 * from the two Ghost IDs + the room code.
 *
 * Why this exists:
 *   The fingerprint is a server-trust check. Both screens should derive
 *   the same four glyphs — if they don't, the server is misbehaving (e.g.
 *   has spliced the room and is feeding each side a different "partner"
 *   for surveillance purposes). Verbally comparing the four glyphs takes
 *   the user three seconds and exposes any mid-session tampering.
 *
 *   It does NOT verify the IDENTITY of the person on the other side. For
 *   a one-time stranger-chat that's not possible without prior context;
 *   for a returning correspondent the fingerprint should be stable across
 *   sessions (given the same two Ghost IDs).
 *
 * Glyph alphabet (8 shapes, 3 bits each = 12 bits of mutual entropy):
 *   ● ○ ■ □ ▲ △ ◆ ◇
 *
 * Sorting the two device IDs lexically before hashing ensures both sides
 * arrive at the same digest regardless of who joined the room first.
 */

const GLYPHS = ['●', '○', '■', '□', '▲', '△', '◆', '◇'] as const;

export type Fingerprint = readonly [string, string, string, string];

export function usePartnerHandshake(
    roomId: string,
    socket: Socket | null,
    selfDeviceId: string | null,
) {
    const [partnerDeviceId, setPartnerDeviceId] = useState<string | null>(null);
    const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);

    // Wire the partner_handshake listener for this room only.
    useEffect(() => {
        if (!socket || !roomId) return;

        const handler = (data: { roomId: string; partnerDeviceId: string }) => {
            if (data.roomId !== roomId || typeof data.partnerDeviceId !== 'string') return;
            setPartnerDeviceId(data.partnerDeviceId);
        };

        socket.on('partner_handshake', handler);
        return () => {
            socket.off('partner_handshake', handler);
        };
    }, [socket, roomId]);

    // Derive the fingerprint asynchronously once both IDs are known.
    useEffect(() => {
        if (!partnerDeviceId || !selfDeviceId || !roomId) {
            setFingerprint(null);
            return;
        }

        let cancelled = false;
        (async () => {
            const [a, b] = [selfDeviceId, partnerDeviceId].sort();
            const payload = `${a}::${b}::${roomId}`;
            const hex = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                payload,
            );
            // Take 4 nibbles (one per glyph) — 3 bits of glyph + 1 bit
            // discarded. SHA256 hex is plenty of entropy.
            const out: string[] = [];
            for (let i = 0; i < 4; i++) {
                const nibble = parseInt(hex[i] ?? '0', 16);
                out.push(GLYPHS[nibble & 0b111]);
            }
            if (!cancelled) {
                setFingerprint(out as unknown as Fingerprint);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selfDeviceId, partnerDeviceId, roomId]);

    // Reset state when the user leaves / room id changes.
    useEffect(() => {
        return () => {
            setPartnerDeviceId(null);
            setFingerprint(null);
        };
    }, [roomId]);

    return { partnerDeviceId, fingerprint };
}
