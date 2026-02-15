import { useState, useCallback } from 'react';

export interface RoomTab {
    roomId: string;
    createdAt: number;
}

const DEFAULT_MAX_ROOMS = 1; // Free tier

export function useRoomManager(maxRooms: number = DEFAULT_MAX_ROOMS) {
    const [rooms, setRooms] = useState<RoomTab[]>([]);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

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
            // If we removed the active room, switch to the last one or null
            if (activeRoomId === roomId) {
                setActiveRoomId(next.length > 0 ? next[next.length - 1].roomId : null);
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
        addRoom,
        removeRoom,
        switchRoom,
    };
}
