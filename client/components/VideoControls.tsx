import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';

export default function VideoControls({
    blur, setBlur, isBnW, setBnW, isMuted, setMuted, onHide
}: any) {
    return (
        <View className="absolute bottom-32 left-4 right-4 bg-void/90 p-6 rounded-2xl border border-ghost/40 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-signal font-mono text-[10px] uppercase tracking-[2px]">Glass Controls</Text>
                <TouchableOpacity onPress={onHide}>
                    <Ionicons name="chevron-down-outline" size={20} color="#333" />
                </TouchableOpacity>
            </View>

            {/* BLUR SLIDER */}
            <View className="mb-8">
                <View className="flex-row justify-between mb-2">
                    <Text className="text-ghost font-mono text-[8px] uppercase">Privacy Blur</Text>
                    <Text className="text-signal font-mono text-[8px]">{Math.round(blur)}%</Text>
                </View>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={0}
                    maximumValue={100}
                    value={blur}
                    onValueChange={setBlur}
                    minimumTrackTintColor="#00FF9D"
                    maximumTrackTintColor="#111"
                    thumbTintColor="#00FF9D"
                />
            </View>

            {/* TOGGLES */}
            <View className="flex-row justify-between space-x-4">
                <TouchableOpacity
                    onPress={() => setBnW(!isBnW)}
                    className={`flex-1 flex-row items-center justify-center p-3 rounded-xl border ${isBnW ? 'bg-signal border-signal' : 'bg-void border-ghost'}`}
                >
                    <Ionicons name="contrast-outline" size={18} color={isBnW ? '#0F1114' : '#333'} />
                    <Text className={`font-mono text-[10px] ml-2 uppercase tracking-[1px] ${isBnW ? 'text-void font-bold' : 'text-ghost'}`}>
                        {isBnW ? 'Noir: On' : 'Noir: Off'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setMuted(!isMuted)}
                    className={`flex-row items-center justify-center px-6 rounded-xl border ${isMuted ? 'bg-destruct/20 border-destruct' : 'bg-void border-ghost'}`}
                >
                    <Ionicons name={isMuted ? 'mic-off-outline' : 'mic-outline'} size={18} color={isMuted ? '#FF453A' : '#333'} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
