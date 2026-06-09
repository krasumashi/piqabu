import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../constants/Config';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../lib/platform/storage';
import { generateUUID } from '../lib/platform/crypto';
import { setProAccess } from '../lib/pro';

// Local-cache keys for lockout state. The server's lockout state
// (maintenance + per-device block) is transient and clears on restart,
// but the CLIENT mirrors it locally so closing and reopening the app
// keeps the user locked out until the server says otherwise. Without
// this, a user could close the app the moment a block lands and reopen
// to a clean session before the next socket connect re-sends the block.
const LOCKOUT_MAINTENANCE_KEY = 'piqabu_lockout_maintenance'; // JSON: { message: string }
const LOCKOUT_BLOCK_KEY = 'piqabu_lockout_block'; // JSON: { reason: string, blockedAt: string }

export function useSocketManager() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [adminBroadcast, setAdminBroadcast] = useState<string | null>(null);
    const [blocked, setBlocked] = useState(false);
    const [blockReason, setBlockReason] = useState<string>('');

    const socketRef = useRef<Socket | null>(null);
    const heartbeatInterval = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        const init = async () => {
            let id = await getSecureItem('piqabu_ghost_id');
            if (!id) {
                id = generateUUID();
                await setSecureItem('piqabu_ghost_id', id);
            }
            setDeviceId(id);

            // Hydrate lockout state from secure-store BEFORE opening the
            // socket. If the user was locked when they last closed the
            // app, the overlay paints immediately on this cold start —
            // the server's authoritative push on connect will either
            // confirm or clear it within a second.
            try {
                const cachedMaint = await getSecureItem(LOCKOUT_MAINTENANCE_KEY);
                if (cachedMaint) {
                    const parsed = JSON.parse(cachedMaint);
                    setMaintenanceMode(true);
                    setMaintenanceMessage(parsed?.message || '');
                }
            } catch { /* corrupt cache — ignore */ }
            try {
                const cachedBlock = await getSecureItem(LOCKOUT_BLOCK_KEY);
                if (cachedBlock) {
                    const parsed = JSON.parse(cachedBlock);
                    setBlocked(true);
                    setBlockReason(parsed?.reason || '');
                }
            } catch { /* corrupt cache — ignore */ }

            const newSocket = io(CONFIG.SIGNAL_TOWER_URL, {
                transports: ['websocket', 'polling'],
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

            // Admin events
            //
            // maintenance_mode is now ALWAYS emitted on connect (both
            // enabled-true and enabled-false), so this listener also
            // serves as the "server says lockout is lifted" signal.
            // We mirror the state to secure-store so the overlay
            // survives an app restart.
            newSocket.on('maintenance_mode', async (data: { enabled: boolean; message: string }) => {
                setMaintenanceMode(data.enabled);
                setMaintenanceMessage(data.message || '');
                try {
                    if (data.enabled) {
                        await setSecureItem(LOCKOUT_MAINTENANCE_KEY, JSON.stringify({
                            message: data.message || '',
                        }));
                    } else {
                        await deleteSecureItem(LOCKOUT_MAINTENANCE_KEY);
                    }
                } catch { /* noop */ }
            });

            // Per-device block. Server emits this on connect if the
            // device is in the in-memory blocked set, and again on any
            // live block toggle. block_lifted is the inverse.
            newSocket.on('force_block', async (data: { reason: string; blockedAt?: string }) => {
                setBlocked(true);
                setBlockReason(data?.reason || '');
                try {
                    await setSecureItem(LOCKOUT_BLOCK_KEY, JSON.stringify({
                        reason: data?.reason || '',
                        blockedAt: data?.blockedAt || new Date().toISOString(),
                    }));
                } catch { /* noop */ }
            });
            newSocket.on('block_lifted', async () => {
                setBlocked(false);
                setBlockReason('');
                try { await deleteSecureItem(LOCKOUT_BLOCK_KEY); } catch { /* noop */ }
            });

            newSocket.on('admin_broadcast', (data: { message: string }) => {
                setAdminBroadcast(data.message);
                // Auto-clear after 10s
                setTimeout(() => setAdminBroadcast(null), 10000);
            });

            // Tier override from Mission Control (POST /admin/devices/:id/tier).
            // Flip the local Pro flag in secure-store so the keyboard /
            // paywall gates immediately reflect the change, and surface a
            // banner so the user knows something happened without having
            // to refresh anything manually.
            newSocket.on('subscription_updated', async (data: { tier?: string }) => {
                const isPro = data?.tier === 'pro';
                try { await setProAccess(isPro); } catch { /* noop */ }
                setAdminBroadcast(isPro
                    ? 'Your Piqabu Pro entitlement is now active. Keyboard + extras unlocked.'
                    : 'Your Piqabu Pro entitlement has been removed.');
                setTimeout(() => setAdminBroadcast(null), 10000);
            });

            newSocket.on('force_disconnect', (data: { message: string }) => {
                if (Platform.OS === 'web') {
                    alert(data.message || 'You have been disconnected.');
                } else {
                    Alert.alert('Disconnected', data.message || 'You have been disconnected.');
                }
                newSocket.disconnect();
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
            if (!socketRef.current.connected) {
                reject(new Error('Signal Tower is unreachable. Please wait for connection.'));
                return;
            }

            const timeoutId = setTimeout(() => {
                reject(new Error('Connection timed out. Server might be waking up.'));
            }, 10000);

            socketRef.current.emit('request_room', (response: { roomCode?: string; error?: string }) => {
                clearTimeout(timeoutId);
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

    /** Manual dismiss for the broadcast banner — user tap dismisses
     *  before the 10s auto-clear fires. */
    const dismissAdminBroadcast = useCallback(() => {
        setAdminBroadcast(null);
    }, []);

    return {
        socket,
        deviceId,
        isConnected,
        requestRoomCode,
        maintenanceMode,
        maintenanceMessage,
        adminBroadcast,
        dismissAdminBroadcast,
        blocked,
        blockReason,
    };
}
