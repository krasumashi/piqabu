import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../constants/Config';
import { getSecureItem, setSecureItem } from '../lib/platform/storage';
import { generateUUID } from '../lib/platform/crypto';

export type LinkStatus = 'WAITING' | 'LINKED' | 'SIGNAL LOST' | 'DISCONNECTED' | 'RECONNECTING';

const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_AUDIO_SIZE = 1 * 1024 * 1024; // 1MB

export function usePiqabu() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [linkStatus, setLinkStatus] = useState<LinkStatus>('DISCONNECTED');
    const [remoteText, setRemoteText] = useState('');
    const [remoteReveal, setRemoteReveal] = useState<string | null>(null);
    const [remoteWhisper, setRemoteWhisper] = useState<string | null>(null);
    const [videoControls, setVideoControls] = useState({ blur: 50, isBnW: true, isMuted: false });

    const heartbeatInterval = useRef<NodeJS.Timeout>();
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const init = async () => {
            let id = await getSecureItem('piqabu_ghost_id');
            if (!id) {
                id = generateUUID();
                await setSecureItem('piqabu_ghost_id', id);
            }
            setDeviceId(id);

            const newSocket = io(CONFIG.SIGNAL_TOWER_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                timeout: 10000,
                auth: { deviceId: id },
            });

            newSocket.on('connect', () => {
                console.log('[SIGNAL] Linked to Signal Tower');
                setLinkStatus('WAITING');

                heartbeatInterval.current = setInterval(() => {
                    newSocket.emit('heartbeat');
                }, 20000);
            });

            newSocket.on('connect_error', (error) => {
                console.log('[SIGNAL] Connection Error:', error.message);
                setLinkStatus('RECONNECTING');
            });

            newSocket.on('reconnect', (attemptNumber: number) => {
                console.log('[SIGNAL] Reconnected on attempt:', attemptNumber);
            });

            newSocket.on('disconnect', () => {
                console.log('[SIGNAL] Disconnected');
                setLinkStatus('RECONNECTING');
                clearInterval(heartbeatInterval.current);
            });

            newSocket.on('link_status', ({ status }: { status: LinkStatus }) => {
                setLinkStatus(status);
            });

            newSocket.on('remote_text', (text: string) => setRemoteText(text));
            newSocket.on('remote_vanish', () => setRemoteText(''));
            newSocket.on('remote_reveal', (payload: string | null) => setRemoteReveal(payload));
            newSocket.on('remote_whisper', (payload: string) => setRemoteWhisper(payload));
            newSocket.on('remote_video_controls', (controls: any) => setVideoControls(controls));

            newSocket.on('signal_blocked', ({ message }: { message: string }) => {
                console.log('[SIGNAL] Blocked:', message);
            });

            newSocket.on('rate_limited', ({ event }: { event: string }) => {
                console.log('[SIGNAL] Rate limited on event:', event);
            });

            socketRef.current = newSocket;
            setSocket(newSocket);
        };

        init();

        return () => {
            socketRef.current?.disconnect();
            clearInterval(heartbeatInterval.current);
        };
    }, []);

    // Server-side room code generation
    const requestRoomCode = useCallback((): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!socketRef.current) {
                reject(new Error('Not connected'));
                return;
            }
            socketRef.current.emit('request_room', (response: { roomCode?: string; error?: string }) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else if (response.roomCode) {
                    resolve(response.roomCode);
                } else {
                    reject(new Error('Invalid response'));
                }
            });
        });
    }, []);

    const joinRoom = useCallback((roomId: string) => {
        if (socketRef.current && deviceId) {
            socketRef.current.emit('join_room', { roomId, deviceId });
        }
    }, [deviceId]);

    const sendText = useCallback((text: string) => {
        if (text.length > MAX_TEXT_LENGTH) {
            console.log('[VALIDATION] Text exceeds max length');
            return;
        }
        socketRef.current?.emit('transmit_text', text);
    }, []);

    const sendVanish = useCallback(() => {
        socketRef.current?.emit('transmit_vanish');
    }, []);

    const sendReveal = useCallback((payload: string | null) => {
        if (payload !== null && payload.length > MAX_IMAGE_SIZE) {
            console.log('[VALIDATION] Image exceeds max size');
            return;
        }
        socketRef.current?.emit('transmit_reveal', payload);
    }, []);

    const sendWhisper = useCallback((payload: string) => {
        if (payload.length > MAX_AUDIO_SIZE) {
            console.log('[VALIDATION] Audio exceeds max size');
            return;
        }
        socketRef.current?.emit('transmit_whisper', payload);
    }, []);

    const updateVideoControls = useCallback((controls: any) => {
        socketRef.current?.emit('transmit_video_controls', controls);
    }, []);

    const leaveRoom = useCallback(() => {
        socketRef.current?.emit('disconnect_intent');
        setLinkStatus('DISCONNECTED');
        setRemoteText('');
        setRemoteReveal(null);
    }, []);

    return {
        deviceId,
        linkStatus,
        remoteText,
        remoteReveal,
        remoteWhisper,
        videoControls,
        requestRoomCode,
        joinRoom,
        sendText,
        sendVanish,
        sendReveal,
        sendWhisper,
        updateVideoControls,
        leaveRoom,
    };
}
