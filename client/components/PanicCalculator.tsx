import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, Modal, StyleSheet,
    StatusBar, Platform, Pressable,
} from 'react-native';

interface PanicCalculatorProps {
    visible: boolean;
    onDismiss: () => Promise<boolean>;
}

/* ═══════════════════════ CALCULATOR LOGIC ════════════════════════ */

function evaluate(expression: string): string {
    try {
        // Replace display operators with JS operators
        const expr = expression
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/−/g, '-');
        // Simple safe eval using Function constructor
        const result = new Function('return ' + expr)();
        if (!isFinite(result)) return 'Error';
        // Format: remove trailing zeros, limit decimals
        const formatted = parseFloat(result.toFixed(8));
        return String(formatted);
    } catch {
        return 'Error';
    }
}

/* ═══════════════════════ COMPONENT ════════════════════════ */

export default function PanicCalculator({ visible, onDismiss }: PanicCalculatorProps) {
    const [display, setDisplay] = useState('0');
    const [hasResult, setHasResult] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handlePress = useCallback((value: string) => {
        switch (value) {
            case 'C':
                setDisplay('0');
                setHasResult(false);
                break;
            case '±':
                setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
                break;
            case '%':
                try {
                    setDisplay(prev => String(parseFloat(prev) / 100));
                } catch { setDisplay('Error'); }
                break;
            case '=':
                setDisplay(prev => evaluate(prev));
                setHasResult(true);
                break;
            case '+': case '−': case '×': case '÷':
                setHasResult(false);
                setDisplay(prev => {
                    if (prev === 'Error') return '0';
                    return prev + value;
                });
                break;
            case '.':
                setDisplay(prev => {
                    // Find the last number segment
                    const parts = prev.split(/[+\−×÷]/);
                    const lastPart = parts[parts.length - 1];
                    if (lastPart.includes('.')) return prev;
                    return prev + '.';
                });
                break;
            default: // digits
                setDisplay(prev => {
                    if (prev === '0' || prev === 'Error' || hasResult) {
                        setHasResult(false);
                        return value;
                    }
                    return prev + value;
                });
                break;
        }
    }, [hasResult]);

    /* Hidden return: long-press '0' for 2 seconds */
    const handleZeroPressIn = useCallback(() => {
        longPressTimer.current = setTimeout(() => {
            onDismiss();
        }, 2000);
    }, [onDismiss]);

    const handleZeroPressOut = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const buttons = [
        ['C', '±', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '−'],
        ['1', '2', '3', '+'],
        ['0', '.', '='],
    ];

    const isOperator = (v: string) => ['+', '−', '×', '÷', '='].includes(v);

    return (
        <Modal
            visible={visible}
            animationType="none"
            statusBarTranslucent
            hardwareAccelerated
        >
            <StatusBar barStyle="light-content" />
            <View style={s.container}>
                {/* Display */}
                <View style={s.display}>
                    <Text
                        style={[s.displayText, display.length > 10 && { fontSize: 40 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {display}
                    </Text>
                </View>

                {/* Button grid */}
                <View style={s.grid}>
                    {buttons.map((row, ri) => (
                        <View key={ri} style={s.row}>
                            {row.map((btn) => {
                                const isOp = isOperator(btn);
                                const isTop = ['C', '±', '%'].includes(btn);
                                const isZero = btn === '0';

                                const btnStyle = [
                                    s.btn,
                                    isOp && s.btnOp,
                                    isTop && s.btnTop,
                                    isZero && s.btnZero,
                                ];

                                const textStyle = [
                                    s.btnText,
                                    isOp && s.btnTextOp,
                                    isTop && s.btnTextTop,
                                ];

                                if (isZero) {
                                    return (
                                        <Pressable
                                            key={btn}
                                            style={({ pressed }) => [
                                                ...btnStyle,
                                                pressed && { opacity: 0.7 },
                                            ]}
                                            onPress={() => handlePress(btn)}
                                            onPressIn={handleZeroPressIn}
                                            onPressOut={handleZeroPressOut}
                                        >
                                            <Text style={[...textStyle, { textAlign: 'left', paddingLeft: 28 }]}>
                                                {btn}
                                            </Text>
                                        </Pressable>
                                    );
                                }

                                return (
                                    <TouchableOpacity
                                        key={btn}
                                        style={btnStyle}
                                        onPress={() => handlePress(btn)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={textStyle}>{btn}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>
        </Modal>
    );
}

/* ═══════════════════════ STYLES ════════════════════════ */

const BUTTON_SIZE = 76;
const GAP = 12;

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'flex-end',
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        paddingHorizontal: 16,
    },
    display: {
        paddingHorizontal: 24,
        paddingBottom: 16,
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        minHeight: 100,
    },
    displayText: {
        fontSize: 64,
        fontWeight: '300',
        color: '#FFFFFF',
    },
    grid: {
        gap: GAP,
    },
    row: {
        flexDirection: 'row',
        gap: GAP,
        justifyContent: 'center',
    },
    btn: {
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        backgroundColor: '#333333',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnOp: {
        backgroundColor: '#FF9F0A',
    },
    btnTop: {
        backgroundColor: '#A5A5A5',
    },
    btnZero: {
        width: BUTTON_SIZE * 2 + GAP,
        borderRadius: BUTTON_SIZE / 2,
        alignItems: 'flex-start',
    },
    btnText: {
        fontSize: 30,
        fontWeight: '400',
        color: '#FFFFFF',
    },
    btnTextOp: {
        color: '#FFFFFF',
        fontSize: 34,
    },
    btnTextTop: {
        color: '#000000',
    },
});
