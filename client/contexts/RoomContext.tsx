import React, { createContext, useContext } from 'react';
import { Socket } from 'socket.io-client';
import { useSocketManager } from '../hooks/useSocketManager';
import { useRoomManager, RoomTab } from '../hooks/useRoomManager';
import { useSubscription } from '../hooks/useSubscription';
import { Tier, TierLimits } from '../lib/subscription/tiers';

interface RoomContextValue {
    // Socket
    socket: Socket | null;
    deviceId: string | null;
    isConnected: boolean;
    requestRoomCode: () => Promise<string>;

    // Room management
    rooms: RoomTab[];
    activeRoomId: string | null;
    addRoom: (roomId: string) => { success: boolean; reason?: string };
    removeRoom: (roomId: string) => void;
    switchRoom: (roomId: string) => void;

    // Subscription
    tier: Tier;
    isPro: boolean;
    limits: TierLimits;
    isSubLoading: boolean;
    refreshSubscription: () => Promise<void>;
}

const RoomCtx = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: React.ReactNode }) {
    const { socket, deviceId, isConnected, requestRoomCode } = useSocketManager();
    const { tier, isPro, limits, isLoading: isSubLoading, refresh: refreshSubscription } = useSubscription(deviceId);
    const { rooms, activeRoomId, addRoom, removeRoom, switchRoom } = useRoomManager(limits.maxRooms);

    return (
        <RoomCtx.Provider
            value={{
                socket,
                deviceId,
                isConnected,
                requestRoomCode,
                rooms,
                activeRoomId,
                addRoom,
                removeRoom,
                switchRoom,
                tier,
                isPro,
                limits,
                isSubLoading,
                refreshSubscription,
            }}
        >
            {children}
        </RoomCtx.Provider>
    );
}

export function useRoomContext() {
    const ctx = useContext(RoomCtx);
    if (!ctx) {
        throw new Error('useRoomContext must be used within a RoomProvider');
    }
    return ctx;
}
