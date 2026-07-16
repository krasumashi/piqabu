const NGROK_SERVER = 'https://patrica-isographic-alone.ngrok-free.dev'; // Local-dev tunnel — only set the URL below to this when actively iterating on server.js
const PROD_SERVER = 'https://api.piqabu.live';

/**
 * Signal Tower (Socket.IO server) base URL.
 *
 * Defaults to a stable Piqabu-owned hostname so releases are not coupled
 * to one hosting provider. Switch back to NGROK_SERVER only when
 * you're actively changing server.js and want to test against your
 * local Node process (then start `node server/server.js` + `ngrok http
 * 3000` and update the ngrok URL above).
 */
export const CONFIG = {
    SIGNAL_TOWER_URL: PROD_SERVER,
};
