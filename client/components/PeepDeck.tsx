import React from 'react';
import { View, Image, Text, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PeepDeck({
    remoteImage, visible, onClose
}: {
    remoteImage: string | null;
    visible: boolean;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View className="flex-1 bg-void/95 justify-center p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <View>
                        <Text className="text-signal font-mono text-xs tracking-[2px] uppercase">Peep Room</Text>
                        <Text className="text-ghost font-mono text-[8px] uppercase">View Only • No Trace</Text>
                    </View>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close-outline" size={28} color="#333" />
                    </TouchableOpacity>
                </View>

                <View className="flex-1 border border-ghost/30 rounded-2xl overflow-hidden bg-black items-center justify-center">
                    {remoteImage ? (
                        <>
                            <Image
                                source={{ uri: remoteImage }}
                                className="w-full h-full"
                                resizeMode="contain"
                            />
                            <View className="absolute bottom-6 bg-void/80 px-4 py-2 border border-signal/30 rounded-full">
                                <Text className="text-signal font-mono text-[10px] uppercase tracking-[1px]">
                                    Partner is Exposing...
                                </Text>
                            </View>
                        </>
                    ) : (
                        <View className="items-center">
                            <Text className="text-ghost font-mono text-xs uppercase tracking-[2px] mb-2">
                                Nothing Exposed... Yet
                            </Text>
                            <Ionicons name="eye-off-outline" size={32} color="#111" />
                        </View>
                    )}
                </View>

                <Text className="text-ghost font-mono text-[8px] text-center mt-6 uppercase">
                    You didn't see this.
                </Text>
            </View>
        </Modal>
    );
}
