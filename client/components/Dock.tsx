import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

type DockOverlay = 'peep' | 'whisper' | 'reveal' | null;

interface DockProps {
    activeOverlay: DockOverlay;
    onToggle: (id: 'peep' | 'whisper' | 'reveal') => void;
    incomingWhisper?: boolean;
    whisperActive?: boolean;
}

const DOCK_ITEMS: { id: 'peep' | 'whisper' | 'reveal'; label: string; icon: string }[] = [
    { id: 'peep', label: 'PEEP', icon: 'eye-outline' },
    { id: 'whisper', label: 'WHISPER', icon: 'mic-outline' },
    { id: 'reveal', label: 'REVEAL', icon: 'folder-open-outline' },
];

export default function Dock({ activeOverlay, onToggle, incomingWhisper, whisperActive }: DockProps) {
    return (
        <View style={styles.container}>
            {DOCK_ITEMS.map((item) => (
                <DockButton
                    key={item.id}
                    item={item}
                    isActive={activeOverlay === item.id}
                    isWhisperActive={item.id === 'whisper' && !!whisperActive}
                    showNotifyDot={item.id === 'whisper' && !!incomingWhisper}
                    onPress={() => onToggle(item.id)}
                />
            ))}
        </View>
    );
}

/**
 * One dock button with its own press-feedback spring animation. Tap
 * scales the whole card down to 0.92, releasing springs back to 1.0
 * — a small tactile cue that makes the dock feel responsive instead
 * of inert. Adopted across PEEP/WHISPER/REVEAL because the dashed
 * cards previously gave no physical feedback on press.
 *
 * Layer A of the dock-polish proposal. Layers B (idle micro-animations
 * per feature) and C (active-state trails) are deferred.
 */
function DockButton({
    item,
    isActive,
    isWhisperActive,
    showNotifyDot,
    onPress,
}: {
    item: typeof DOCK_ITEMS[number];
    isActive: boolean;
    isWhisperActive: boolean;
    showNotifyDot: boolean;
    onPress: () => void;
}) {
    const scale = useRef(new Animated.Value(1)).current;

    const onPressIn = () => {
        Animated.spring(scale, {
            toValue: 0.92,
            useNativeDriver: true,
            speed: 30,
            bounciness: 0,
        }).start();
    };
    const onPressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 18,
            bounciness: 10,
        }).start();
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={{ flex: 1 }}
        >
            <Animated.View
                style={[
                    styles.dockItem,
                    isActive && styles.dockItemActive,
                    { transform: [{ scale }] },
                ]}
            >
                {/* Circle */}
                <View style={[
                    styles.circle,
                    isWhisperActive && styles.circleWhisperActive,
                ]}>
                    <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={isWhisperActive ? THEME.accEmerald : THEME.muted}
                    />
                    {/* Notify badge */}
                    {showNotifyDot && (
                        <View style={styles.notifyDot} />
                    )}
                </View>

                {/* Label */}
                <Text style={[
                    styles.label,
                    (isActive || isWhisperActive) && styles.labelActive,
                ]}>
                    {item.label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(245,243,235,0.14)',
        borderStyle: 'dashed' as any,
    },
    dockItem: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'transparent',
    },
    dockItemActive: {
        backgroundColor: 'rgba(245,243,235,0.02)',
    },
    circle: {
        width: 44,
        height: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'dashed' as any,
        borderColor: 'rgba(245,243,235,0.22)',
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleWhisperActive: {
        borderWidth: 2,
        borderStyle: 'solid' as any,
        borderColor: THEME.accEmerald,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: 'rgba(255, 255, 255, 0.8)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 8,
    },
    notifyDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: THEME.accDanger,
        borderWidth: 2,
        borderColor: THEME.bg,
    },
    label: {
        fontFamily: THEME.mono,
        fontSize: 10,
        letterSpacing: 10 * 0.28,
        textTransform: 'uppercase',
        color: THEME.muted,
        fontWeight: '900',
    },
    labelActive: {
        color: THEME.ink,
    },
});
