const MIME_EXTENSION: Record<string, string> = {
    'application/pdf': '.pdf',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
};

/**
 * iOS pickers can return a display name without a file extension. The server
 * intentionally discards the display name but preserves its extension so the
 * receiving Peep deck can choose the correct renderer.
 */
export function ensureUploadExtension(fileName: string, mimeType: string): string {
    const cleanName = fileName.trim() || 'upload';
    if (/\.[a-z0-9]{1,10}$/i.test(cleanName)) return cleanName;

    const cleanMime = mimeType.split(';', 1)[0].trim().toLowerCase();
    const extension = MIME_EXTENSION[cleanMime];
    return extension ? `${cleanName}${extension}` : cleanName;
}
