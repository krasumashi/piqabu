import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { Socket } from 'socket.io-client';

export type LinkStatus = 'WAITING' | 'LINKED' | 'SIGNAL LOST' | 'DISCONNECTED';

export type RemoteStreamItem =
    | { id: string; type: 'text'; text: string; createdAt: number; expiresAt: number | null }
    | { id: string; type: 'media'; uri: string; createdAt: number };

export interface RevealMeta {
    itemId?: string;
    textTtlMs?: number;
    purge?: boolean;
}

const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12MB base64 (~8MB binary)
const MAX_AUDIO_SIZE = 1 * 1024 * 1024;

export function useRoom(roomId: string, socket: Socket | null, deviceId: string | null) {
    const [linkStatus, setLinkStatus] = useState<LinkStatus>('DISCONNECTED');
    const [remoteText, setRemoteText] = useState('');
    const [remoteReveal, setRemoteReveal] = useState<string | null>(null);
    const [remoteStream, setRemoteStream] = useState<RemoteStreamItem[]>([]);
    // Session gallery — every distinct item the partner has shown this
    // session, accumulated so the viewer can scroll back through all of
    // them on the Peek deck (each new SHOW adds rather than replaces).
    // remoteReveal stays the "currently/last shown" item (drives the
    // PEEK badge); revealGallery is the durable list. Reset on session
    // end and background memory-wipe.
    const [revealGallery, setRevealGallery] = useState<string[]>([]);
    const [remoteWhisper, setRemoteWhisper] = useState<string | null>(null);
    const [videoControls, setVideoControls] = useState({ blur: 50, isBnW: true, isMuted: false });
    const [pendingInvite, setPendingInvite] = useState<{ feature: string } | null>(null);
    const [inviteStatus, setInviteStatus] = useState<'none' | 'sent' | 'accepted' | 'declined'>('none');
    const [inviteFeature, setInviteFeature] = useState<string>('');
    // Last server-side block message for this room, surfaced to the UI so
    // the room screen can render a friendly error state (e.g. for the
    // TIME_FENCED case where a stale share-link is being joined).
    const [lastBlock, setLastBlock] = useState<{ message: string; ageMs?: number } | null>(null);

    const joinedRef = useRef(false);
    const remoteTextRef = useRef('');
    const streamTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const clearStreamTimers = useCallback(() => {
        streamTimersRef.current.forEach((timer) => clearTimeout(timer));
        streamTimersRef.current.clear();
    }, []);

    const resetTransientStream = useCallback(() => {
        clearStreamTimers();
        remoteTextRef.current = '';
        setRemoteText('');
        setRemoteReveal(null);
        setRevealGallery([]);
        setRemoteStream([]);
    }, [clearStreamTimers]);

    // Join room on connect (and re-join on every reconnect)
    useEffect(() => {
        if (!socket || !deviceId || !roomId) return;

        const handleConnect = () => {
            socket.emit('join_room', { roomId, deviceId });
            joinedRef.current = true;
        };

        // If already connected, join immediately
        if (socket.connected) {
            handleConnect();
        }

        // Re-join on every reconnect
        socket.on('connect', handleConnect);

        return () => {
            socket.off('connect', handleConnect);
            if (joinedRef.current) {
                socket.emit('leave_room', { roomId });
                joinedRef.current = false;
            }
        };
    }, [socket, deviceId, roomId]);

    /**
     * Memory-wipe on background. When the app moves to background, zero
     * out the in-memory message buffers — remoteText, remoteReveal,
     * remoteWhisper. The Socket.IO connection itself isn't touched; on
     * 'active' return, fresh state will land if the session is still
     * alive, or the user sees an empty pane (which is the correct
     * representation of an abandoned/ephemeral chat).
     *
     * This reduces the surface area of a forensic memory grab while the
     * app sits in recents — combined with FLAG_SECURE blocking the
     * recents thumbnail, there's nothing to scrape even if the OS
     * preserves the process.
     */
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'background' || state === 'inactive') {
                resetTransientStream();
                setRemoteWhisper(null);
            }
        });
        return () => sub.remove();
    }, [resetTransientStream]);

    useEffect(() => () => clearStreamTimers(), [clearStreamTimers]);

    // Listen to events filtered by roomId
    useEffect(() => {
        if (!socket || !roomId) return;

        const handleLinkStatus = (data: { roomId: string; status: LinkStatus }) => {
            if (data.roomId === roomId) {
                setLinkStatus(data.status);
                // Clear reveal when partner disconnects
                if (data.status === 'WAITING' || data.status === 'SIGNAL LOST' || data.status === 'DISCONNECTED') {
                    resetTransientStream();
                }
            }
        };

        const handleRemoteText = (data: { roomId: string; text: string } | string) => {
            if (typeof data === 'object' && data.roomId === roomId) {
                remoteTextRef.current = data.text;
                setRemoteText(data.text);
            } else if (typeof data === 'string') {
                // Legacy single-room compat
                remoteTextRef.current = data;
                setRemoteText(data);
            }
        };

        const handleRemoteVanish = (data: { roomId: string; scope?: 'current' | 'all' } | undefined) => {
            if (!data || (typeof data === 'object' && data.roomId === roomId)) {
                remoteTextRef.current = '';
                setRemoteText('');
                // A legacy unscoped event represented the entire visible
                // text surface. Preserve that expectation for mixed-version
                // rooms by treating it as a full text wipe.
                if (!data?.scope || data.scope === 'all') {
                    streamTimersRef.current.forEach((timer, key) => {
                        if (key.startsWith('text:')) {
                            clearTimeout(timer);
                            streamTimersRef.current.delete(key);
                        }
                    });
                    setRemoteStream((prev) => prev.filter((item) => item.type !== 'text'));
                }
            }
        };

        // The gallery is the live set of items the partner currently has
        // shown. 'show' adds an item, 'cover' removes that specific item,
        // 'coverAll' clears everything. remoteReveal tracks the most recent
        // change (drives the PEEK badge).
        const applyReveal = (
            payload: string | null,
            action: 'show' | 'cover' | 'coverAll',
            meta: RevealMeta = {},
        ) => {
            if (action === 'coverAll') {
                setRemoteReveal(null);
                setRevealGallery([]);
                setRemoteStream((prev) => prev.filter((item) => item.type !== 'media'));
                return;
            }
            if (action === 'cover') {
                if (payload) setRevealGallery((prev) => prev.filter((u) => u !== payload));
                setRemoteReveal((prev) => (prev === payload ? null : prev));
                setRemoteStream((prev) => prev.filter((item) => (
                    item.type !== 'media'
                    || (meta.itemId ? item.id !== `media:${meta.itemId}` : item.uri !== payload)
                )));
                return;
            }
            // show
            setRemoteReveal(payload);
            if (payload) {
                setRevealGallery((prev) => (prev.includes(payload) ? prev : [...prev, payload]));

                const itemId = meta.itemId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const now = Date.now();
                const boundaryText = remoteTextRef.current;
                const ttl = typeof meta.textTtlMs === 'number' && meta.textTtlMs > 0
                    ? Math.min(meta.textTtlMs, 30000)
                    : 0;
                const textId = `text:${itemId}`;
                const mediaId = `media:${itemId}`;

                setRemoteStream((prev) => {
                    const next = [...prev];
                    if (boundaryText && !next.some((item) => item.id === textId)) {
                        next.push({
                            id: textId,
                            type: 'text',
                            text: boundaryText,
                            createdAt: now,
                            expiresAt: ttl ? now + ttl : null,
                        });
                    }
                    if (!next.some((item) => item.id === mediaId)) {
                        next.push({ id: mediaId, type: 'media', uri: payload, createdAt: now });
                    }
                    return next;
                });

                // A shown object closes the current live text block. The
                // sender follows with an empty text revision; clearing now
                // avoids briefly rendering the same text twice.
                remoteTextRef.current = '';
                setRemoteText('');

                if (boundaryText && ttl > 0) {
                    const timer = setTimeout(() => {
                        setRemoteStream((prev) => prev.filter((item) => item.id !== textId));
                        streamTimersRef.current.delete(textId);
                    }, ttl);
                    streamTimersRef.current.set(textId, timer);
                }
            }
        };

        const handleRemoteReveal = (
            data: {
                roomId: string;
                payload: string | null;
                action?: 'show' | 'cover' | 'coverAll';
                itemId?: string;
                textTtlMs?: number;
            } | string | null,
        ) => {
            if (typeof data === 'object' && data !== null && 'roomId' in data) {
                if (data.roomId === roomId) {
                    applyReveal(data.payload, data.action ?? 'show', {
                        itemId: data.itemId,
                        textTtlMs: data.textTtlMs,
                    });
                }
            } else {
                // Legacy (payload-only) — always a show.
                applyReveal(data as string | null, 'show');
            }
        };

        const handleRemoteWhisper = (data: { roomId: string; payload: string } | string) => {
            if (typeof data === 'object' && 'roomId' in data) {
                if (data.roomId === roomId) {
                    setRemoteWhisper(data.payload);
                }
            } else {
                setRemoteWhisper(data as string);
            }
        };

        const handleRemoteVideoControls = (data: { roomId: string; controls: any } | any) => {
            if (typeof data === 'object' && 'roomId' in data) {
                if (data.roomId === roomId) {
                    setVideoControls(data.controls);
                }
            } else {
                setVideoControls(data);
            }
        };

        const handleSignalBlocked = ({ message, roomId: blockedRoom, ageMs }: any) => {
            if (blockedRoom === roomId || !blockedRoom) {
                console.log(`[SIGNAL] Blocked in ${roomId}: ${message}`);
                if (typeof message === 'string') {
                    setLastBlock({ message, ageMs });
                }
            }
        };

        const handleReceiveInvite = (data: { roomId: string; feature: string }) => {
            if (data.roomId === roomId) {
                setPendingInvite({ feature: data.feature });
            }
        };

        const handleInviteAccepted = (data: { roomId: string; feature: string }) => {
            if (data.roomId === roomId) {
                setInviteStatus('accepted');
                setInviteFeature(data.feature);
            }
        };

        const handleInviteDeclined = (data: { roomId: string; feature: string }) => {
            if (data.roomId === roomId) {
                setInviteStatus('declined');
                setInviteFeature(data.feature);
                setTimeout(() => setInviteStatus('none'), 2000);
            }
        };

        socket.on('link_status', handleLinkStatus);
        socket.on('remote_text', handleRemoteText);
        socket.on('remote_vanish', handleRemoteVanish);
        socket.on('remote_reveal', handleRemoteReveal);
        socket.on('remote_whisper', handleRemoteWhisper);
        socket.on('remote_video_controls', handleRemoteVideoControls);
        socket.on('signal_blocked', handleSignalBlocked);
        socket.on('receive_invite', handleReceiveInvite);
        socket.on('invite_accepted', handleInviteAccepted);
        socket.on('invite_declined', handleInviteDeclined);

        return () => {
            socket.off('link_status', handleLinkStatus);
            socket.off('remote_text', handleRemoteText);
            socket.off('remote_vanish', handleRemoteVanish);
            socket.off('remote_reveal', handleRemoteReveal);
            socket.off('remote_whisper', handleRemoteWhisper);
            socket.off('remote_video_controls', handleRemoteVideoControls);
            socket.off('signal_blocked', handleSignalBlocked);
            socket.off('receive_invite', handleReceiveInvite);
            socket.off('invite_accepted', handleInviteAccepted);
            socket.off('invite_declined', handleInviteDeclined);
        };
    }, [socket, roomId, resetTransientStream]);

    // --- Emit functions (include roomId) ---
    const sendText = useCallback((text: string) => {
        if (text.length > MAX_TEXT_LENGTH || !socket) return;
        socket.emit('transmit_text', { roomId, text });
    }, [socket, roomId]);

    const sendVanish = useCallback((scope: 'current' | 'all' = 'current') => {
        socket?.emit('transmit_vanish', { roomId, scope });
    }, [socket, roomId]);

    const sendReveal = useCallback((
        payload: string | null,
        action: 'show' | 'cover' | 'coverAll' = 'show',
        meta: RevealMeta = {},
    ) => {
        // Server upload URLs are short strings — skip size check for those
        if (payload !== null && !payload.startsWith('/uploads/') && payload.length > MAX_IMAGE_SIZE) return;
        socket?.emit('transmit_reveal', {
            roomId,
            payload,
            action,
            itemId: meta.itemId,
            textTtlMs: meta.textTtlMs,
            purge: meta.purge === true,
        });
    }, [socket, roomId]);

    const sendWhisper = useCallback((payload: string) => {
        if (payload.length > MAX_AUDIO_SIZE) return;
        socket?.emit('transmit_whisper', { roomId, payload });
    }, [socket, roomId]);

    const updateVideoControls = useCallback((controls: any) => {
        socket?.emit('transmit_video_controls', { roomId, controls });
    }, [socket, roomId]);

    const sendInvite = useCallback((feature: string) => {
        socket?.emit('send_invite', { roomId, feature });
        setInviteStatus('sent');
        setInviteFeature(feature);
    }, [socket, roomId]);

    const acceptInvite = useCallback((feature: string) => {
        socket?.emit('accept_invite', { roomId, feature });
        setPendingInvite(null);
    }, [socket, roomId]);

    const declineInvite = useCallback((feature: string) => {
        socket?.emit('decline_invite', { roomId, feature });
        setPendingInvite(null);
    }, [socket, roomId]);

    const clearInviteStatus = useCallback(() => {
        setInviteStatus('none');
        setInviteFeature('');
    }, []);

    const clearBlock = useCallback(() => setLastBlock(null), []);

    return {
        linkStatus,
        remoteText,
        remoteReveal,
        revealGallery,
        remoteStream,
        remoteWhisper,
        videoControls,
        sendText,
        sendVanish,
        sendReveal,
        sendWhisper,
        updateVideoControls,
        pendingInvite,
        inviteStatus,
        inviteFeature,
        sendInvite,
        acceptInvite,
        declineInvite,
        clearInviteStatus,
        lastBlock,
        clearBlock,
    };
}
