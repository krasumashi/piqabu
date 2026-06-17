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
    { id: 'peep', label: 'PEEK', icon: 'eye-outline' },
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
                        {/* Accessory cell */}
                        <View style={[
                            styles.circle,
                            isActive && styles.circleActive,
                            isWhisperActive && styles.circleWhisperActive,
                        ]}>
                            <Ionicons
                                name={item.icon as any}
                                size={20}
                                color={(isActive || isWhisperActive) ? THEME.ink : THEME.muted}
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
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 4,
        // No outer box — each button is just its accessory cell + label.
        // Active state reads through the icon cell + label brightening.
    },
    dockItemActive: {},
    circle: {
        width: 44,
        height: 44,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.16)',
        backgroundColor: 'rgba(245,243,235,0.035)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleActive: {
        borderColor: 'rgba(245,243,235,0.34)',
        backgroundColor: 'rgba(245,243,235,0.10)',
    },
    circleWhisperActive: {
        borderColor: 'rgba(255,255,255,0.65)',
        backgroundColor: 'rgba(255,255,255,0.10)',
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
