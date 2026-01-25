import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { io, Socket } from 'socket.io-client';
import * as Crypto from 'expo-crypto';
import { CONFIG } from '../constants/Config';

export type LinkStatus = 'WAITING' | 'LINKED' | 'SIGNAL LOST' | 'DISCONNECTED' | 'RECONNECTING';

export function usePiqabu() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [linkStatus, setLinkStatus] = useState<LinkStatus>('DISCONNECTED');
    const [remoteText, setRemoteText] = useState('');
    const [remoteReveal, setRemoteReveal] = useState<string | null>(null);
    const [remoteWhisper, setRemoteWhisper] = useState<string | null>(null);
    const [videoControls, setVideoControls] = useState({ blur: 50, isBnW: true, isMuted: false });

    const heartbeatInterval = useRef<NodeJS.Timeout>();

    useEffect(() => {
        const init = async () => {
            let id = await SecureStore.getItemAsync('piqabu_ghost_id');
            if (!id) {
                id = Crypto.randomUUID();
                await SecureStore.setItemAsync('piqabu_ghost_id', id);
            }
            setDeviceId(id);

            const newSocket = io(CONFIG.SIGNAL_TOWER_URL, {
                transports: ['websocket'], // Critical for Expo/React Native
                reconnection: true,
                reconnectionAttempts: Infinity,
                timeout: 10000,
            });

            newSocket.on('connect', () => {
                console.log('[SIGNAL] Linked to Signal Tower');
                setLinkStatus('WAITING');

                // Start Heartbeat to keep Render pipe open
                heartbeatInterval.current = setInterval(() => {
                    newSocket.emit('heartbeat');
                }, 20000); // Send every 20s
            });

            newSocket.on('connect_error', (error) => {
                console.log('[SIGNAL] Connection Error:', error.message);
                setLinkStatus('RECONNECTING');
            });

            newSocket.on('reconnect', (attemptNumber) => {
                console.log('[SIGNAL] Reconnected on attempt:', attemptNumber);
            });

            newSocket.on('disconnect', () => {
                console.log('[SIGNAL] Disconnected');
                setLinkStatus('RECONNECTING');
                clearInterval(heartbeatInterval.current);
            });

            newSocket.on('link_status', ({ status }) => {
                setLinkStatus(status);
            });

            newSocket.on('remote_text', (text: string) => setRemoteText(text));
            newSocket.on('remote_vanish', () => setRemoteText(''));
            newSocket.on('remote_reveal', (payload: string | null) => setRemoteReveal(payload));
            newSocket.on('remote_whisper', (payload: string) => setRemoteWhisper(payload));
            newSocket.on('remote_video_controls', (controls: any) => setVideoControls(controls));

            setSocket(newSocket);
        };

        init();

        return () => {
            socket?.disconnect();
            clearInterval(heartbeatInterval.current);
        };
    }, []);

    const joinRoom = useCallback((roomId: string) => {
        if (socket && deviceId) {
            socket.emit('join_room', { roomId, deviceId });
        }
    }, [socket, deviceId]);

    const sendText = useCallback((text: string) => {
        socket?.emit('transmit_text', text);
    }, [socket]);

    const sendVanish = useCallback(() => {
        socket?.emit('transmit_vanish');
    }, [socket]);

    const sendReveal = useCallback((payload: string | null) => {
        socket?.emit('transmit_reveal', payload);
    }, [socket]);

    const sendWhisper = useCallback((payload: string) => {
        socket?.emit('transmit_whisper', payload);
    }, [socket]);

    const updateVideoControls = useCallback((controls: any) => {
        socket?.emit('transmit_video_controls', controls);
    }, [socket]);

    const leaveRoom = useCallback(() => {
        socket?.emit('disconnect_intent');
        setLinkStatus('DISCONNECTED');
        setRemoteText('');
        setRemoteReveal(null);
    }, [socket]);

    return {
        deviceId,
        linkStatus,
        remoteText,
        remoteReveal,
        remoteWhisper,
        videoControls,
        joinRoom,
        sendText,
        sendVanish,
        sendReveal,
        sendWhisper,
        updateVideoControls,
        leaveRoom
    };
}
