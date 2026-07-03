/**
 * Minimal service worker for the Piqabu PWA.
 *
 * Presence matters: iOS treats an "Add to Home Screen" web app that has a
 * registered service worker as a properly-installed PWA and persists its
 * storage (localStorage / IndexedDB) across launches. Without one, iOS can
 * clear storage aggressively — which is why the onboarding flag (and the
 * ghost ID) kept resetting on reopen.
 *
 * Network passthrough — no offline caching in v1 (the app needs the live
 * server anyway). Not calling respondWith lets the browser fetch normally.
 */
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
    // Passthrough — let the browser handle the request normally.
});
