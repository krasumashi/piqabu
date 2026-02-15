import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoomTab } from '../hooks/useRoomManager';
import { LinkStatus } from '../hooks/useRoom';

interface RoomTabBarProps {
    rooms: RoomTab[];
    activeRoomId: string | null;
    roomStatuses: Record<string, LinkStatus>;
    onSwitchRoom: (roomId: string) => void;
    onAddRoom: () => void;
    onCloseRoom: (roomId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
    LINKED: '#00FF9D',
    WAITING: '#FFB800',
    'SIGNAL LOST': '#FF453A',
    DISCONNECTED: '#333333',
};

export default function RoomTabBar({
    rooms,
    activeRoomId,
    roomStatuses,
    onSwitchRoom,
    onAddRoom,
    onCloseRoom,
}: RoomTabBarProps) {
    if (rooms.length <= 1) return null; // Hide tab bar for single room

    return (
        <View className="border-b border-ghost/20 bg-void">
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6 }}
            >
                {rooms.map((room) => {
                    const isActive = room.roomId === activeRoomId;
                    const status = roomStatuses[room.roomId] || 'DISCONNECTED';
                    const statusColor = STATUS_COLORS[status] || '#333333';

                    return (
                        <TouchableOpacity
                            key={room.roomId}
                            onPress={() => onSwitchRoom(room.roomId)}
                            className={`flex-row items-center px-3 py-2 rounded-lg mr-2 border ${
                                isActive
                                    ? 'border-signal/40 bg-signal/10'
                                    : 'border-ghost/20 bg-void'
                            }`}
                        >
                            <View
                                style={{ backgroundColor: statusColor }}
                                className="w-1.5 h-1.5 rounded-full mr-2"
                            />
                            <Text
                                className={`font-mono text-[9px] uppercase tracking-[1px] ${
                                    isActive ? 'text-signal' : 'text-ghost'
                                }`}
                            >
                                {room.roomId}
                            </Text>
                            {rooms.length > 1 && (
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        onCloseRoom(room.roomId);
                                    }}
                                    className="ml-2 p-0.5"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="close" size={10} color={isActive ? '#00FF9D' : '#333'} />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Add Room Button */}
                <TouchableOpacity
                    onPress={onAddRoom}
                    className="flex-row items-center px-3 py-2 rounded-lg border border-dashed border-ghost/30"
                >
                    <Ionicons name="add" size={12} color="#333" />
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}
