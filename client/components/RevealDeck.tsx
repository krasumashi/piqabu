import React, { useState, useRef, useEffect } from 'react';
import { View, Image, TouchableOpacity, Text, Modal, Alert, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024; // 1.5MB base64 string limit

export default function RevealDeck({
    visible, onClose, onReveal, onOpenLiveMirror,
}: {
    visible: boolean;
    onClose: () => void;
    onReveal: (payload: string | null) => void;
    onOpenLiveMirror?: () => void;
}) {
    const [image, setImage] = useState<string | null>(null);
    const [isRevealed, setRevealed] = useState(false);
    const slideAnim = useRef(new Animated.Value(600)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0, tension: 50, friction: 10, useNativeDriver: true,
            }).start();
        } else {
            slideAnim.setValue(600);
        }
    }, [visible]);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].base64) {
            const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
            if (dataUri.length > MAX_IMAGE_SIZE) {
                // Retry with lower quality
                const lowRes = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    base64: true,
                    quality: 0.2,
                });
                if (!lowRes.canceled && lowRes.assets[0].base64) {
                    const lowUri = `data:image/jpeg;base64,${lowRes.assets[0].base64}`;
                    if (lowUri.length > MAX_IMAGE_SIZE) {
                        Alert.alert('File Too Large', 'Image is too large even at low quality. Choose a smaller image.');
                        return;
                    }
                    setImage(lowUri);
                    setRevealed(false);
                    return;
                }
                return;
            }
            setImage(dataUri);
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
        <Modal visible={visible} animationType="none" transparent>
            <View className="flex-1 justify-end">
                <Animated.View
                    style={{ transform: [{ translateY: slideAnim }] }}
                    className="bg-void border-t border-ghost/50 p-6 rounded-t-3xl h-3/4"
                >
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-6">
                        <View>
                            <Text className="text-signal font-mono text-xs tracking-[2px] uppercase font-bold">
                                Reveal Vault
                            </Text>
                            <Text className="text-ghost font-mono text-[8px] uppercase tracking-[1px]">
                                Loaded: {image ? '1' : '0'} {'\u2022'} Exposed: {isRevealed ? '1' : '0'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                            <Ionicons name="close-outline" size={28} color="#555" />
                        </TouchableOpacity>
                    </View>

                    {!image ? (
                        <View className="flex-1">
                            {/* Add Evidence */}
                            <TouchableOpacity
                                onPress={pickImage}
                                activeOpacity={0.7}
                                className="flex-1 border-2 border-dashed border-ghost/30 rounded-2xl items-center justify-center"
                            >
                                <Ionicons name="add-circle-outline" size={48} color="#333" />
                                <Text className="text-ghost font-mono text-xs uppercase tracking-[2px] mt-3">
                                    Add Evidence
                                </Text>
                            </TouchableOpacity>

                            {/* Live Mirror Button */}
                            {onOpenLiveMirror && (
                                <TouchableOpacity
                                    onPress={onOpenLiveMirror}
                                    activeOpacity={0.7}
                                    className="mt-4 p-4 rounded-xl border border-ghost/30 flex-row items-center justify-center"
                                >
                                    <Ionicons name="desktop-outline" size={18} color="#555" />
                                    <Text className="text-ghost font-mono text-[10px] ml-2 uppercase tracking-[2px]">
                                        Live Mirror
                                    </Text>
                                    <View className="ml-2 bg-amber/20 rounded-full px-2 py-0.5">
                                        <Text className="text-amber font-mono text-[7px] uppercase">Soon</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <View className="flex-1">
                            <View className="flex-1 bg-black rounded-2xl overflow-hidden mb-4 relative">
                                <Image
                                    source={{ uri: image }}
                                    className={`w-full h-full ${!isRevealed ? 'opacity-30' : ''}`}
                                    resizeMode="contain"
                                    style={!isRevealed ? { filter: 'grayscale(100%)' } as any : undefined}
                                />
                                {!isRevealed && (
                                    <View className="absolute inset-0 items-center justify-center">
                                        <Ionicons name="eye-off-outline" size={48} color="#333" />
                                    </View>
                                )}
                            </View>

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    onPress={clear}
                                    activeOpacity={0.7}
                                    className="p-4 rounded-xl border border-destruct/40 items-center justify-center"
                                >
                                    <Ionicons name="trash-outline" size={24} color="#FF453A" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={toggleReveal}
                                    activeOpacity={0.7}
                                    className={`flex-1 p-4 rounded-xl border items-center justify-center ${
                                        isRevealed ? 'bg-signal border-signal' : 'bg-void border-ghost/40'
                                    }`}
                                >
                                    <Text className={`font-mono font-bold uppercase tracking-[2px] ${
                                        isRevealed ? 'text-void' : 'text-ghost'
                                    }`}>
                                        {isRevealed ? 'Exposing (Live)' : 'Tap to Expose'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <Text className="text-ghost/30 font-mono text-[7px] text-center mt-4 uppercase tracking-[1px]">
                        Expose = Visible to their Peep Room. Cover = Hidden.
                    </Text>
                </Animated.View>
            </View>
        </Modal>
    );
}
