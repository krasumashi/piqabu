import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../constants/Config';
import { getSecureItem, setSecureItem } from '../lib/platform/storage';
import { generateUUID } from '../lib/platform/crypto';

export function useSocketManager() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const heartbeatInterval = useRef<NodeJS.Timeout>();

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
                setIsConnected(true);
                heartbeatInterval.current = setInterval(() => {
                    newSocket.emit('heartbeat');
                }, 20000);
            });

            newSocket.on('disconnect', () => {
                setIsConnected(false);
                clearInterval(heartbeatInterval.current);
            });

            newSocket.on('connect_error', () => {
                setIsConnected(false);
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

    return {
        socket,
        deviceId,
        isConnected,
        requestRoomCode,
    };
}
