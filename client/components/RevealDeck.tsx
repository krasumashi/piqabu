import React, { useState } from 'react';
import { View, Button, Image, TouchableOpacity, Text, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

export default function RevealDeck({
    visible, onClose, onReveal
}: {
    visible: boolean;
    onClose: () => void;
    onReveal: (payload: string | null) => void;
}) {
    const [image, setImage] = useState<string | null>(null);
    const [isRevealed, setRevealed] = useState(false);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].base64) {
            setImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
            setRevealed(false);
        }
    };

    const toggleReveal = () => {
        if (!image) return;
        const newState = !isRevealed;
        setRevealed(newState);
        onReveal(newState ? image : null);
    };

    const clear = () => {
        setImage(null);
        setRevealed(false);
        onReveal(null);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 justify-end">
                <View className="bg-void border-t border-ghost/50 p-6 rounded-t-3xl h-3/4">
                    <View className="flex-row justify-between items-center mb-8">
                        <View>
                            <Text className="text-signal font-mono text-xs tracking-[2px] uppercase">Reveal Vault</Text>
                            <Text className="text-ghost font-mono text-[8px] uppercase">Loaded: {image ? '1' : '0'} • Exposed: {isRevealed ? '1' : '0'}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close-outline" size={28} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {!image ? (
                        <TouchableOpacity
                            onPress={pickImage}
                            className="flex-1 border-2 border-dashed border-ghost rounded-2xl items-center justify-center space-y-4"
                        >
                            <Ionicons name="add-circle-outline" size={48} color="#333" />
                            <Text className="text-ghost font-mono text-xs uppercase tracking-[2px]">Add Evidence</Text>
                        </TouchableOpacity>
                    ) : (
                        <View className="flex-1">
                            <View className="flex-1 bg-black rounded-2xl overflow-hidden mb-6 relative">
                                <Image
                                    source={{ uri: image }}
                                    className={`w-full h-full ${!isRevealed ? 'opacity-30 grayscale' : ''}`}
                                    resizeMode="contain"
                                />
                                {!isRevealed && (
                                    <View className="absolute inset-0 items-center justify-center">
                                        <Ionicons name="eye-off-outline" size={48} color="#333" />
                                    </View>
                                )}
                            </View>

                            <View className="flex-row space-x-4">
                                <TouchableOpacity
                                    onPress={clear}
                                    className="p-4 rounded-xl border border-destruct items-center justify-center"
                                >
                                    <Ionicons name="trash-outline" size={24} color="#FF453A" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={toggleReveal}
                                    className={`flex-1 p-4 rounded-xl border items-center justify-center ${isRevealed ? 'bg-signal border-signal' : 'bg-void border-ghost'}`}
                                >
                                    <Text className={`font-mono font-bold uppercase tracking-[2px] ${isRevealed ? 'text-void' : 'text-ghost'}`}>
                                        {isRevealed ? 'Exposing (Live)' : 'Tap to Expose'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <Text className="text-ghost font-mono text-[8px] text-center mt-6 uppercase">
                        Expose = Visible to their Peep Room. Cover = Hidden.
                    </Text>
                </View>
            </View>
        </Modal>
    );
}
