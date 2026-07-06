import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RoomTab {
    roomId: string;
    createdAt: number;
    /**
     * Where the room came from. Determines whether the handshake/waiting
     * screen appears as the first frame in /room.
     *   - `manual`   — user generated + entered from the landing screen.
     *                  Opens straight into the existing chat UI.
     *   - `deeplink` — user tapped a piqabu.live/j/CODE link, OR the
     *                  keyboard's MINT button fired Intent.ACTION_VIEW
     *                  on the share-link. Shows the handshake screen
     *                  (WAITING -> LINKED states) before the chat UI.
     */
    origin?: 'manual' | 'deeplink';
}

const DEFAULT_MAX_ROOMS = 99; // [TESTING] Hard bypassed Free tier limits

// Channels are ephemeral: closing the app (any way) clears them. The ONLY
// exception is Android's permission-grant activity restart — granting
// camera/mic/media can kill+relaunch the app mid-session, and we don't want
// that to drop the user out of an active call. We can't tell that restart
// apart from an intentional close by *time*, so instead we key off an
// explicit marker (`PERM_RESTART_KEY`) that SecurityContext stamps whenever
// a native picker/permission dialog opens. Rooms are restored only if that
// marker is fresh; otherwise every (re)launch starts clean.
const RESTART_WINDOW_MS = 25_000;
const RESTART_FLAG_KEY = 'piqabu_perm_restart';
const STORAGE_KEY = 'piqabu_session_rooms_v2';

interface PersistedSession {
    rooms: RoomTab[];
    activeRoomId: string | null;
    savedAt: number;
}

export function useRoomManager(maxRooms: number = DEFAULT_MAX_ROOMS) {
    const [rooms, setRooms] = useState<RoomTab[]>([]);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);

    // On mount, restore rooms ONLY if a permission-restart marker is fresh.
    // Any other (re)launch — including an intentional swipe-close + reopen —
    // starts with no channels.
    useEffect(() => {
        (async () => {
            try {
                const flagRaw = await AsyncStorage.getItem(RESTART_FLAG_KEY);
                const flag = flagRaw ? parseInt(flagRaw, 10) : 0;
                const restartRecent = flag > 0 && (Date.now() - flag) < RESTART_WINDOW_MS;

                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (restartRecent && raw) {
                    const session: PersistedSession = JSON.parse(raw);
                    if (session.rooms.length > 0) {
                        setRooms(session.rooms);
                        setActiveRoomId(session.activeRoomId);
                    }
                } else {
                    // Not a permission restart → fresh start. Clear channels.
                    await AsyncStorage.removeItem(STORAGE_KEY);
                }
                // Consume the marker so it can't restore a second time.
                await AsyncStorage.removeItem(RESTART_FLAG_KEY);
            } catch {}
            setHydrated(true);
        })();
    }, []);

    // Persist rooms to storage after every change (so permission-triggered restarts recover state)
    useEffect(() => {
        if (!hydrated) return; // Don't overwrite restored state before hydration
        const session: PersistedSession = { rooms, activeRoomId, savedAt: Date.now() };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(() => {});
    }, [rooms, activeRoomId, hydrated]);

    const addRoom = useCallback((
        roomId: string,
        origin: 'manual' | 'deeplink' = 'manual',
    ): { success: boolean; reason?: string } => {
        // Check if already exists
        if (rooms.some(r => r.roomId === roomId)) {
            setActiveRoomId(roomId);
            return { success: true };
        }

        // Check limit
        if (rooms.length >= maxRooms) {
            return { success: false, reason: 'UPGRADE_REQUIRED' };
        }

        const newRoom: RoomTab = {
            roomId,
            createdAt: Date.now(),
            origin,
        };

        setRooms(prev => [...prev, newRoom]);
        setActiveRoomId(roomId);
        return { success: true };
    }, [rooms, maxRooms]);

    const removeRoom = useCallback((roomId: string) => {
        setRooms(prev => {
            const next = prev.filter(r => r.roomId !== roomId);
            if (activeRoomId === roomId) {
                setActiveRoomId(next.length > 0 ? next[next.length - 1].roomId : null);
            }
            // When the last room is removed, clear the session immediately
            if (next.length === 0) {
                AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
            }
            return next;
        });
    }, [activeRoomId]);

    const switchRoom = useCallback((roomId: string) => {
        if (rooms.some(r => r.roomId === roomId)) {
            setActiveRoomId(roomId);
        }
    }, [rooms]);

    return {
        rooms,
        activeRoomId,
        hydrated,
        addRoom,
        removeRoom,
        switchRoom,
    };
}
