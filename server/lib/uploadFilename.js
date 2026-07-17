const path = require('path');

const MIME_EXTENSION = Object.freeze({
    'application/pdf': '.pdf',
    'application/rtf': '.rtf',
    'application/zip': '.zip',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'text/csv': '.csv',
    'text/plain': '.txt',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
});

const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/i;

/**
 * Multer receives extensionless original names from some iOS picker paths.
 * Preserve a safe declared extension when present, otherwise recover one from
 * the multipart MIME type so static serving and Peep media detection agree.
 */
function getSafeUploadExtension(originalName, mimeType) {
    const declared = path.extname(typeof originalName === 'string' ? originalName : '').toLowerCase();
    if (SAFE_EXTENSION.test(declared)) return declared;

    const cleanMime = typeof mimeType === 'string'
        ? mimeType.split(';', 1)[0].trim().toLowerCase()
        : '';
    return MIME_EXTENSION[cleanMime] || '.bin';
}

module.exports = { getSafeUploadExtension };
