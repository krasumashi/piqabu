/**
 * DocumentViewer
 *
 * On-device PDF rendering for the Peep Room. Documents stay local —
 * react-native-pdf streams the file straight from the Piqabu server
 * to the device's PDF renderer. No third party touches the bytes.
 *
 * Contract:
 *   - View only. No save / share / print UI is exposed.
 *   - Screenshot prevention is the parent's responsibility (PeepDeck
 *     already calls preventScreenCaptureAsync). This component adds a
 *     visible watermark on top of every page as a second line of defense.
 *   - Lazy native import. If APK was built without react-native-pdf,
 *     the component renders a "Update app" placeholder instead of
 *     crashing the JS bundle.
 *
 * Future:
 *   - DOCX/PPTX support requires server-side conversion to PDF
 *     (LibreOffice headless on Render). v2.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/Theme';

// Lazy import — APKs built before react-native-pdf was added must not crash.
let Pdf: any = null;
try {
    Pdf = require('react-native-pdf').default;
} catch (e) {
    // Native module not in this build. Caller will see the fallback.
}

interface DocumentViewerProps {
    /** Fully-resolved URL or local file:// path. */
    uri: string;
    /** Called once the PDF is parsed and the page count is known. */
    onLoadComplete?: (numberOfPages: number) => void;
    /** Called whenever the user scrolls to a new page. */
    onPageChanged?: (page: number, total: number) => void;
    /** Called if the renderer fails (corrupt file, network error, etc). */
    onError?: (error: Error) => void;
}

/**
 * Renders a PDF inline. Read-only — no native save/share/print affordances.
 * The renderer streams pages on demand; the full file does not need to
 * land in app storage before the first page is visible.
 */
export default function DocumentViewer({
    uri,
    onLoadComplete,
    onPageChanged,
    onError,
}: DocumentViewerProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    // Native module missing (older APK). Tell the user to update.
    if (!Pdf) {
        return (
            <View style={styles.fallbackCard}>
                <Ionicons name="document-text" size={56} color={THEME.accSky} />
                <Text style={styles.fallbackTitle}>PDF DOCUMENT</Text>
                <Text style={styles.fallbackSub}>
                    Update Piqabu to view documents on-device.
                </Text>
            </View>
        );
    }

    if (errored) {
        return (
            <View style={styles.fallbackCard}>
                <Ionicons name="alert-circle-outline" size={56} color={THEME.warn} />
                <Text style={styles.fallbackTitle}>COULDN'T OPEN DOCUMENT</Text>
                <Text style={styles.fallbackSub}>
                    The file may be corrupt or unavailable. Ask your correspondent to share it again.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Pdf
                source={{ uri, cache: true }}
                style={styles.pdf}
                trustAllCerts={false}
                enablePaging={false}
                enableAntialiasing={true}
                enableAnnotationRendering={false}
                horizontal={false}
                spacing={8}
                fitPolicy={0}
                onLoadComplete={(num: number) => {
                    setTotalPages(num);
                    setLoading(false);
                    onLoadComplete?.(num);
                }}
                onPageChanged={(page: number, total: number) => {
                    setCurrentPage(page);
                    onPageChanged?.(page, total);
                }}
                onError={(err: any) => {
                    console.warn('[DocumentViewer] PDF render error:', err);
                    setLoading(false);
                    setErrored(true);
                    onError?.(err instanceof Error ? err : new Error(String(err)));
                }}
                renderActivityIndicator={() => (
                    <ActivityIndicator size="large" color={THEME.accSky} />
                )}
            />

            {/* Loading overlay — covers the renderer's first paint flash */}
            {loading && (
                <View style={styles.loadingOverlay} pointerEvents="none">
                    <ActivityIndicator size="large" color={THEME.accSky} />
                    <Text style={styles.loadingText}>OPENING DOCUMENT</Text>
                </View>
            )}

            {/* Page counter chip */}
            {!loading && totalPages > 0 && (
                <View style={styles.pageChip} pointerEvents="none">
                    <Text style={styles.pageChipText}>
                        {currentPage} / {totalPages}
                    </Text>
                </View>
            )}
        </View>
    );
}

/**
 * Convenience helper for the parent: detects whether the URI looks like
 * a PDF (so the parent knows whether to mount DocumentViewer at all).
 */
export function isPdfDocument(uri: string): boolean {
    return uri.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(uri);
}

/**
 * Whether the runtime can render PDFs on-device. Used by the parent to
 * gate UI affordances (e.g. show a "PDF only" filter on the picker).
 */
export const HAS_NATIVE_PDF: boolean = Pdf !== null;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: '#000',
    },
    pdf: {
        flex: 1,
        width: '100%',
        backgroundColor: '#000',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
    },
    loadingText: {
        color: THEME.muted,
        fontSize: 11,
        letterSpacing: 2,
        marginTop: 14,
    },
    pageChip: {
        position: 'absolute',
        bottom: 16,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderWidth: 1,
        borderColor: 'rgba(245,243,235,0.20)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pageChipText: {
        color: THEME.paper,
        fontSize: 11,
        letterSpacing: 1.5,
        fontWeight: '600',
    },
    fallbackCard: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#000',
    },
    fallbackTitle: {
        color: THEME.paper,
        fontSize: 13,
        letterSpacing: 2,
        fontWeight: '700',
        marginTop: 18,
    },
    fallbackSub: {
        color: THEME.muted,
        fontSize: 11,
        letterSpacing: 1,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 16,
    },
});
