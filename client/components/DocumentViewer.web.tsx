/**
 * DocumentViewer — WEB variant.
 *
 * Metro auto-selects this file over DocumentViewer.tsx when bundling for
 * web, which keeps the native-only `react-native-pdf` module out of the
 * web bundle entirely. Browsers render PDFs natively, so we just embed
 * the resolved URL in an <iframe>.
 *
 * Same public surface as the native component (default export +
 * isPdfDocument + HAS_NATIVE_PDF) so callers don't branch.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface DocumentViewerProps {
    uri: string;
    onLoadComplete?: (numberOfPages: number) => void;
    onPageChanged?: (page: number, total: number) => void;
    onError?: (error: Error) => void;
}

export default function DocumentViewer({ uri, onLoadComplete }: DocumentViewerProps) {
    // The browser's built-in PDF viewer handles rendering. onLoadComplete
    // is best-effort here (we can't easily read the page count from an
    // iframe), so we signal a nominal single page once it mounts.
    React.useEffect(() => { onLoadComplete?.(1); }, [uri]);
    return (
        <View style={styles.container}>
            {React.createElement('iframe', {
                src: uri,
                title: 'document',
                style: { width: '100%', height: '100%', border: 'none', background: '#000' },
            })}
        </View>
    );
}

export function isPdfDocument(uri: string): boolean {
    return uri.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(uri);
}

// Browsers can always render PDFs, so on web this is effectively true.
export const HAS_NATIVE_PDF = true;

const styles = StyleSheet.create({
    container: { flex: 1, width: '100%', backgroundColor: '#000' },
});
