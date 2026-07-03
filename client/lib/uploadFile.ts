import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { CONFIG } from '../constants/Config';

/**
 * Upload a file to the server via HTTP and return the server URL.
 * Handles Android content:// URIs by copying to cache first.
 */
export async function uploadFile(
    uri: string,
    fileName: string,
    mimeType: string,
    roomId: string,
): Promise<{ url: string } | { error: string }> {
    try {
        // Web: the browser's FormData needs a real Blob/File, not React
        // Native's { uri, name, type } shape. Fetch the blob (works for
        // blob:, data:, and http(s) URIs the pickers hand back) and post
        // it. Don't set Content-Type — the browser adds the multipart
        // boundary itself.
        if (Platform.OS === 'web') {
            let blob: Blob;
            try {
                blob = await (await fetch(uri)).blob();
            } catch {
                return { error: 'Could not read the file. Try a different file.' };
            }
            const webForm = new FormData();
            webForm.append('file', blob, fileName);
            webForm.append('roomId', roomId);
            const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/upload`, { method: 'POST', body: webForm });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                return { error: text || `Upload failed (${res.status})` };
            }
            const data = await res.json();
            if (!data.url) return { error: 'Server did not return a file URL.' };
            return { url: data.url };
        }

        // On Android, content:// URIs can't be used directly with FormData.
        // Copy to a cache file first.
        let fileUri = uri;
        if (Platform.OS === 'android' && uri.startsWith('content://')) {
            const ext = fileName.split('.').pop() || 'bin';
            const cacheUri = (FileSystem.cacheDirectory || '') + 'upload_' + Date.now() + '.' + ext;
            try {
                await FileSystem.copyAsync({ from: uri, to: cacheUri });
                fileUri = cacheUri;
            } catch {
                // Try downloadAsync as fallback for stubborn content:// URIs
                try {
                    const dl = await FileSystem.downloadAsync(uri, cacheUri);
                    fileUri = dl.uri;
                } catch {
                    return { error: 'Could not read the file. Try a different file.' };
                }
            }
        }

        const formData = new FormData();
        formData.append('file', {
            uri: fileUri,
            name: fileName,
            type: mimeType,
        } as any);
        formData.append('roomId', roomId);

        const response = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/upload`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { error: text || `Upload failed (${response.status})` };
        }

        const data = await response.json();
        if (!data.url) {
            return { error: 'Server did not return a file URL.' };
        }

        return { url: data.url };
    } catch (e: any) {
        console.warn('[uploadFile] error:', e?.message);
        return { error: e?.message || 'Upload failed. Please try again.' };
    }
}
