/**
 * Post-export PWA head injector.
 *
 * Expo's single-output ("output": "single") web export writes a fixed
 * dist/index.html that has no PWA manifest link or iOS "Add to Home
 * Screen" meta tags (and +html.tsx is ignored in single mode). This
 * patches them in after each export. Idempotent — safe to re-run.
 *
 * Run automatically via `npm run build:web`, or manually:
 *   node scripts/inject-pwa-head.js
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const MARKER = 'apple-mobile-web-app-capable';

const HEAD_TAGS = `    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <meta name="theme-color" content="#060709" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Piqabu" />
  </head>`;

if (!fs.existsSync(INDEX)) {
    console.error('[inject-pwa-head] dist/index.html not found — run `expo export --platform web` first.');
    process.exit(1);
}

let html = fs.readFileSync(INDEX, 'utf8');

if (html.includes(MARKER)) {
    console.log('[inject-pwa-head] Already injected; nothing to do.');
    process.exit(0);
}

// Upgrade the viewport for edge-to-edge fullscreen on notched iPhones.
html = html.replace(
    /<meta name="viewport"[^>]*\/>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover" />',
);

// Insert the PWA + iOS tags immediately before </head>.
html = html.replace('</head>', HEAD_TAGS);

fs.writeFileSync(INDEX, html, 'utf8');
console.log('[inject-pwa-head] Injected PWA manifest + iOS standalone meta tags into dist/index.html');
