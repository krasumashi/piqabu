import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';
import { useWalkthroughTarget } from '../lib/walkthrough/WalkthroughContext';

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
    // Walkthrough targets — one ref per dock item, registered by
    // name so WalkthroughOverlay can measure each. Hooks can't be
    // called inside the map below, so we pre-bind them in the parent.
    const peepRef = useWalkthroughTarget('peep');
    const whisperRef = useWalkthroughTarget('whisper');
    const revealRef = useWalkthroughTarget('reveal');
    const refByName: Record<typeof DOCK_ITEMS[number]['id'], React.RefObject<View | null>> = {
        peep: peepRef as React.RefObject<View | null>,
        whisper: whisperRef as React.RefObject<View | null>,
        reveal: revealRef as React.RefObject<View | null>,
    };

    return (
        <View style={styles.container}>
            {DOCK_ITEMS.map((item) => {
                const isActive = activeOverlay === item.id;
                const isWhisperActive = item.id === 'whisper' && whisperActive;

                return (
                    <TouchableOpacity
                        key={item.id}
                        ref={refByName[item.id]}
                        onPress={() => onToggle(item.id)}
                        activeOpacity={0.7}
                        style={[
                            styles.dockItem,
                            isActive && styles.dockItemActive,
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
                                style={{ opacity: 1 }}
                            />
                            {/* Notify badge */}
                            {item.id === 'whisper' && incomingWhisper && (
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
                    </TouchableOpacity>
                );
            })}
        </View>
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
        // Shadow for glow effect
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
