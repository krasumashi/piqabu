import React, { createContext, useContext } from 'react';
import { Socket } from 'socket.io-client';
import { useSocketManager } from '../hooks/useSocketManager';
import { useRoomManager, RoomTab } from '../hooks/useRoomManager';
import { useSubscription } from '../hooks/useSubscription';
import { Tier, TierLimits } from '../lib/subscription/tiers';
import type { UpdateNotice } from '../lib/updateApplier';

interface RoomContextValue {
    // Socket
    socket: Socket | null;
    deviceId: string | null;
    isConnected: boolean;
    requestRoomCode: () => Promise<string>;

    // Room management
    rooms: RoomTab[];
    activeRoomId: string | null;
    hydrated: boolean;
    addRoom: (roomId: string, origin?: 'manual' | 'deeplink') => { success: boolean; reason?: string };
    removeRoom: (roomId: string) => void;
    switchRoom: (roomId: string) => void;

    // Subscription
    tier: Tier;
    isPro: boolean;
    limits: TierLimits;
    isSubLoading: boolean;
    refreshSubscription: () => Promise<void>;

    // Admin
    maintenanceMode: boolean;
    maintenanceMessage: string;
    adminBroadcast: string | null;
    dismissAdminBroadcast: () => void;
    blocked: boolean;
    blockReason: string;
    updateNotice: UpdateNotice | null;
    dismissedNoticeId: string | null;
    dismissUpdateNotice: (noticeId: string) => Promise<void>;
}

const RoomCtx = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: React.ReactNode }) {
    const {
        socket, deviceId, isConnected, requestRoomCode,
        maintenanceMode, maintenanceMessage,
        adminBroadcast, dismissAdminBroadcast,
        blocked, blockReason,
        updateNotice, dismissedNoticeId, dismissUpdateNotice,
    } = useSocketManager();
    const { tier, isPro, limits, isLoading: isSubLoading, refresh: refreshSubscription } = useSubscription(deviceId);
    const { rooms, activeRoomId, hydrated, addRoom, removeRoom, switchRoom } = useRoomManager(limits.maxRooms);

    return (
        <RoomCtx.Provider
            value={{
                socket,
                deviceId,
                isConnected,
                requestRoomCode,
                rooms,
                activeRoomId,
                hydrated,
                addRoom,
                removeRoom,
                switchRoom,
                tier,
                isPro,
                limits,
                isSubLoading,
                refreshSubscription,
                maintenanceMode,
                maintenanceMessage,
                adminBroadcast,
                dismissAdminBroadcast,
                blocked,
                blockReason,
                updateNotice,
                dismissedNoticeId,
                dismissUpdateNotice,
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
