import React, { useState, useMemo } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';

const CELL_SIZE = 30;
const LINE_COLOR = 'rgba(245, 243, 235, 0.04)';
const LINE_WIDTH = StyleSheet.hairlineWidth;

export default function GridBackground() {
    const [size, setSize] = useState({ w: 0, h: 0 });

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
    };

    const lines = useMemo(() => {
        if (!size.w || !size.h) return null;

        const hLines: React.ReactElement[] = [];
        const vLines: React.ReactElement[] = [];

        const cols = Math.floor(size.w / CELL_SIZE);
        const rows = Math.floor(size.h / CELL_SIZE);

        for (let i = 1; i <= rows; i++) {
            hLines.push(
                <View
                    key={`h${i}`}
                    style={{
                        position: 'absolute',
                        top: i * CELL_SIZE,
                        left: 0,
                        right: 0,
                        height: LINE_WIDTH,
                        backgroundColor: LINE_COLOR,
                    }}
                />,
            );
        }

        for (let i = 1; i <= cols; i++) {
            vLines.push(
                <View
                    key={`v${i}`}
                    style={{
                        position: 'absolute',
                        left: i * CELL_SIZE,
                        top: 0,
                        bottom: 0,
                        width: LINE_WIDTH,
                        backgroundColor: LINE_COLOR,
                    }}
                />,
            );
        }

        return [...hLines, ...vLines];
    }, [size.w, size.h]);

    return (
        <View style={styles.container} onLayout={onLayout} pointerEvents="none">
            {lines}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
});
