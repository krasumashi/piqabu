import { CONFIG } from '../constants/Config';

let cached: RTCIceServer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const FALLBACK_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export async function fetchIceServers(): Promise<RTCIceServer[]> {
    if (cached && Date.now() - cacheTime < CACHE_TTL) return cached;
    try {
        const res = await fetch(`${CONFIG.SIGNAL_TOWER_URL}/ice-servers`);
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
            cached = data.iceServers;
            cacheTime = Date.now();
            return cached;
        }
    } catch (e) {
        console.warn('[iceServers] Failed to fetch, using fallback STUN:', e);
    }
    return FALLBACK_SERVERS;
}
