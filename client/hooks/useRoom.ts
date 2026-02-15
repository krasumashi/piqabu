import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';

export type LinkStatus = 'WAITING' | 'LINKED' | 'SIGNAL LOST' | 'DISCONNECTED';

const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_SIZE = 1 * 1024 * 1024;

export function useRoom(roomId: string, socket: Socket | null, deviceId: string | null) {
    const [linkStatus, setLinkStatus] = useState<LinkStatus>('DISCONNECTED');
    const [remoteText, setRemoteText] = useState('');
    const [remoteReveal, setRemoteReveal] = useState<string | null>(null);
    const [remoteWhisper, setRemoteWhisper] = useState<string | null>(null);
    const [videoControls, setVideoControls] = useState({ blur: 50, isBnW: true, isMuted: false });

    const joinedRef = useRef(false);

    // Join room on mount
    useEffect(() => {
        if (!socket || !deviceId || !roomId) return;

        socket.emit('join_room', { roomId, deviceId });
        joinedRef.current = true;

        return () => {
            if (joinedRef.current) {
                socket.emit('leave_room', { roomId });
                joinedRef.current = false;
            }
        };
    }, [socket, deviceId, roomId]);

    // Listen to events filtered by roomId
    useEffect(() => {
        if (!socket || !roomId) return;

        const handleLinkStatus = (data: { roomId: string; status: LinkStatus }) => {
            if (data.roomId === roomId) {
                setLinkStatus(data.status);
            }
        };

        const handleRemoteText = (data: { roomId: string; text: string } | string) => {
            if (typeof data === 'object' && data.roomId === roomId) {
                setRemoteText(data.text);
            } else if (typeof data === 'string') {
                // Legacy single-room compat
                setRemoteText(data);
            }
        };

        const handleRemoteVanish = (data: { roomId: string } | undefined) => {
            if (!data || (typeof data === 'object' && data.roomId === roomId)) {
                setRemoteText('');
            }
        };

        const handleRemoteReveal = (data: { roomId: string; payload: string | null } | string | null) => {
            if (typeof data === 'object' && data !== null && 'roomId' in data) {
                if (data.roomId === roomId) {
                    setRemoteReveal(data.payload);
                }
            } else {
                // Legacy
                setRemoteReveal(data as string | null);
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

        const handleSignalBlocked = ({ message, roomId: blockedRoom }: any) => {
            if (blockedRoom === roomId || !blockedRoom) {
                console.log(`[SIGNAL] Blocked in ${roomId}: ${message}`);
            }
        };

        socket.on('link_status', handleLinkStatus);
        socket.on('remote_text', handleRemoteText);
        socket.on('remote_vanish', handleRemoteVanish);
        socket.on('remote_reveal', handleRemoteReveal);
        socket.on('remote_whisper', handleRemoteWhisper);
        socket.on('remote_video_controls', handleRemoteVideoControls);
        socket.on('signal_blocked', handleSignalBlocked);

        return () => {
            socket.off('link_status', handleLinkStatus);
            socket.off('remote_text', handleRemoteText);
            socket.off('remote_vanish', handleRemoteVanish);
            socket.off('remote_reveal', handleRemoteReveal);
            socket.off('remote_whisper', handleRemoteWhisper);
            socket.off('remote_video_controls', handleRemoteVideoControls);
            socket.off('signal_blocked', handleSignalBlocked);
        };
    }, [socket, roomId]);

    // --- Emit functions (include roomId) ---
    const sendText = useCallback((text: string) => {
        if (text.length > MAX_TEXT_LENGTH || !socket) return;
        socket.emit('transmit_text', { roomId, text });
    }, [socket, roomId]);

    const sendVanish = useCallback(() => {
        socket?.emit('transmit_vanish', { roomId });
    }, [socket, roomId]);

    const sendReveal = useCallback((payload: string | null) => {
        if (payload !== null && payload.length > MAX_IMAGE_SIZE) return;
        socket?.emit('transmit_reveal', { roomId, payload });
    }, [socket, roomId]);

    const sendWhisper = useCallback((payload: string) => {
        if (payload.length > MAX_AUDIO_SIZE) return;
        socket?.emit('transmit_whisper', { roomId, payload });
    }, [socket, roomId]);

    const updateVideoControls = useCallback((controls: any) => {
        socket?.emit('transmit_video_controls', { roomId, controls });
    }, [socket, roomId]);

    return {
        linkStatus,
        remoteText,
        remoteReveal,
        remoteWhisper,
        videoControls,
        sendText,
        sendVanish,
        sendReveal,
        sendWhisper,
        updateVideoControls,
    };
}
