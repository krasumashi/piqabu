/**
 * Socket.IO per-event rate limiter using a sliding window.
 * Tracks event counts per socket in a time window and disconnects
 * or blocks events when limits are exceeded.
 */

const RATE_LIMITS = {
    join_room: { max: 5, windowMs: 60000 },
    leave_room: { max: 10, windowMs: 60000 },
    request_room: { max: 5, windowMs: 60000 },
    transmit_text: { max: 120, windowMs: 60000 },
    transmit_vanish: { max: 30, windowMs: 60000 },
    transmit_reveal: { max: 10, windowMs: 60000 },
    transmit_whisper: { max: 10, windowMs: 60000 },
    transmit_video_controls: { max: 30, windowMs: 60000 },
    heartbeat: { max: 10, windowMs: 60000 },
};

// Track failed join attempts for brute-force protection
const failedJoinAttempts = new Map(); // socketId -> { count, firstAttemptAt }
const BRUTE_FORCE_MAX = 10;
const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function createSocketRateLimiter() {
    return function rateLimiterMiddleware(socket, next) {
        // Attach rate state to each socket
        socket.data.rateBuckets = {};

        // Wrap socket.on to intercept events
        const originalOn = socket.on.bind(socket);
        socket.on = function (event, handler) {
            if (!RATE_LIMITS[event]) {
                // No rate limit defined for this event, pass through
                return originalOn(event, handler);
            }

            return originalOn(event, (...args) => {
                const limit = RATE_LIMITS[event];
                const now = Date.now();

                if (!socket.data.rateBuckets[event]) {
                    socket.data.rateBuckets[event] = [];
                }

                const bucket = socket.data.rateBuckets[event];

                // Remove entries outside the window
                while (bucket.length > 0 && bucket[0] <= now - limit.windowMs) {
                    bucket.shift();
                }

                if (bucket.length >= limit.max) {
                    console.log(`[RATE LIMIT] ${event} exceeded for socket ${socket.id}`);
                    socket.emit('rate_limited', { event, retryAfterMs: limit.windowMs });
                    return;
                }

                bucket.push(now);
                handler(...args);
            });
        };

        next();
    };
}

function checkBruteForce(socketId) {
    const record = failedJoinAttempts.get(socketId);
    if (!record) return false;

    const now = Date.now();
    if (now - record.firstAttemptAt > BRUTE_FORCE_WINDOW_MS) {
        // Window expired, reset
        failedJoinAttempts.delete(socketId);
        return false;
    }

    return record.count >= BRUTE_FORCE_MAX;
}

function recordFailedJoin(socketId) {
    const now = Date.now();
    const record = failedJoinAttempts.get(socketId);

    if (!record || now - record.firstAttemptAt > BRUTE_FORCE_WINDOW_MS) {
        failedJoinAttempts.set(socketId, { count: 1, firstAttemptAt: now });
    } else {
        record.count++;
    }
}

function clearBruteForceRecord(socketId) {
    failedJoinAttempts.delete(socketId);
}

module.exports = {
    createSocketRateLimiter,
    checkBruteForce,
    recordFailedJoin,
    clearBruteForceRecord,
};
