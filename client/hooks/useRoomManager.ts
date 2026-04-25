import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RoomTab {
    roomId: string;
    createdAt: number;
}

const DEFAULT_MAX_ROOMS = 99; // [TESTING] Hard bypassed Free tier limits

// Rooms are only considered valid if they were saved within this window.
// 90 seconds covers the full Android permission-restart cycle (typically <5s),
// but is short enough that rooms from a previous session are discarded.
const SESSION_TTL_MS = 90_000;
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

    // On mount, restore rooms if within the TTL window (permission restart recovery)
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const session: PersistedSession = JSON.parse(raw);
                    const age = Date.now() - session.savedAt;
                    if (age < SESSION_TTL_MS && session.rooms.length > 0) {
                        // Restore the room so the redirect guard doesn't fire
                        setRooms(session.rooms);
                        setActiveRoomId(session.activeRoomId);
                    } else {
                        // Expired or empty — clean up
                        await AsyncStorage.removeItem(STORAGE_KEY);
                    }
                }
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

    const addRoom = useCallback((roomId: string): { success: boolean; reason?: string } => {
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
