/**
 * Input validation for Socket.IO event payloads.
 * All validators return { valid: boolean, error?: string, sanitized?: any }.
 */

const validator = require('validator');

const ROOM_ID_REGEX = /^[A-Z2-9]{6}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_DATA_URI_REGEX = /^data:[a-z]+\/[a-z0-9.+-]+;base64,/i;

const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB base64 string length
const MAX_AUDIO_SIZE = 1 * 1024 * 1024; // 1MB base64 string length

function validateRoomId(roomId) {
    if (typeof roomId !== 'string') {
        return { valid: false, error: 'roomId must be a string' };
    }
    const clean = roomId.trim().toUpperCase();
    if (!ROOM_ID_REGEX.test(clean)) {
        return { valid: false, error: 'roomId must be 6 alphanumeric characters (A-Z, 2-9)' };
    }
    return { valid: true, sanitized: clean };
}

function validateDeviceId(deviceId) {
    if (typeof deviceId !== 'string') {
        return { valid: false, error: 'deviceId must be a string' };
    }
    const clean = deviceId.trim();
    if (!UUID_REGEX.test(clean)) {
        return { valid: false, error: 'deviceId must be a valid UUID' };
    }
    return { valid: true, sanitized: clean };
}

function validateText(text) {
    if (typeof text !== 'string') {
        return { valid: false, error: 'text must be a string' };
    }
    if (text.length > MAX_TEXT_LENGTH) {
        return { valid: false, error: `text exceeds max length of ${MAX_TEXT_LENGTH}` };
    }
    // Strip any HTML/script tags to prevent XSS if text is ever rendered in web
    const sanitized = validator.stripLow(text, true); // keep newlines
    return { valid: true, sanitized };
}

function validateRevealPayload(payload) {
    if (payload === null) {
        return { valid: true, sanitized: null };
    }
    if (typeof payload !== 'string') {
        return { valid: false, error: 'reveal payload must be a string or null' };
    }
    if (payload.length > MAX_IMAGE_SIZE) {
        return { valid: false, error: `image exceeds max size of ${MAX_IMAGE_SIZE} bytes` };
    }
    if (!BASE64_DATA_URI_REGEX.test(payload)) {
        return { valid: false, error: 'reveal payload must be a valid data URI' };
    }
    return { valid: true, sanitized: payload };
}

const VALID_WHISPER_FILTERS = ['true', 'ghost', 'lowkey', 'robot'];

function validateWhisperPayload(payload) {
    if (typeof payload !== 'string') {
        return { valid: false, error: 'whisper payload must be a string' };
    }
    if (payload.length > MAX_AUDIO_SIZE) {
        return { valid: false, error: `audio exceeds max size of ${MAX_AUDIO_SIZE} bytes` };
    }
    if (!BASE64_DATA_URI_REGEX.test(payload)) {
        return { valid: false, error: 'whisper payload must be a valid data URI' };
    }
    return { valid: true, sanitized: payload };
}

function validateWhisperFilter(filter) {
    if (typeof filter !== 'string' || !VALID_WHISPER_FILTERS.includes(filter)) {
        return { valid: false, error: 'invalid whisper filter' };
    }
    return { valid: true, sanitized: filter };
}

function validateVideoControls(controls) {
    if (typeof controls !== 'object' || controls === null) {
        return { valid: false, error: 'controls must be an object' };
    }
    const { blur, isBnW, isMuted } = controls;

    if (typeof blur !== 'number' || blur < 0 || blur > 100) {
        return { valid: false, error: 'blur must be a number between 0 and 100' };
    }
    if (typeof isBnW !== 'boolean') {
        return { valid: false, error: 'isBnW must be a boolean' };
    }
    if (typeof isMuted !== 'boolean') {
        return { valid: false, error: 'isMuted must be a boolean' };
    }

    // Strip extra fields
    return { valid: true, sanitized: { blur, isBnW, isMuted } };
}

function validateJoinRoom(data) {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'join_room data must be an object' };
    }

    const roomResult = validateRoomId(data.roomId);
    if (!roomResult.valid) return roomResult;

    const deviceResult = validateDeviceId(data.deviceId);
    if (!deviceResult.valid) return deviceResult;

    return {
        valid: true,
        sanitized: {
            roomId: roomResult.sanitized,
            deviceId: deviceResult.sanitized,
        },
    };
}

const VALID_INVITE_FEATURES = ['whisper', 'live_glass', 'screen_share'];

function validateInviteFeature(feature) {
    if (typeof feature !== 'string' || !VALID_INVITE_FEATURES.includes(feature)) {
        return { valid: false, error: 'invalid invite feature' };
    }
    return { valid: true, sanitized: feature };
}

module.exports = {
    validateRoomId,
    validateDeviceId,
    validateText,
    validateRevealPayload,
    validateWhisperPayload,
    validateWhisperFilter,
    validateVideoControls,
    validateJoinRoom,
    validateInviteFeature,
    MAX_TEXT_LENGTH,
    MAX_IMAGE_SIZE,
    MAX_AUDIO_SIZE,
};
