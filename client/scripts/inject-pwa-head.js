/**
 * Post-export PWA head injector.
 *
 * Expo's single-output ("output": "single") web export writes a fixed
 * dist/index.html that has no PWA manifest link or iOS "Add to Home
 * Screen" meta tags (and +html.tsx is ignored in single mode). It also
 * relies on a runtime font loader that iOS Safari chokes on, so the
 * Ionicons glyphs + SpaceMono text render as blank boxes on iPhone.
 *
 * This patches all of that in after each export. Idempotent — safe to
 * re-run. Runs automatically via `npm run build:web`, or manually:
 *   node scripts/inject-pwa-head.js
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');
const MARKER = 'apple-mobile-web-app-capable';

if (!fs.existsSync(INDEX)) {
    console.error('[inject-pwa-head] dist/index.html not found — run `expo export --platform web` first.');
    process.exit(1);
}

let html = fs.readFileSync(INDEX, 'utf8');

if (html.includes(MARKER)) {
    console.log('[inject-pwa-head] Already injected; nothing to do.');
    process.exit(0);
}

// --- Find the bundled font files (hashed names change per build) ---------
function findFile(dir, re) {
    const stack = [dir];
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) stack.push(full);
            else if (re.test(e.name)) return full;
        }
    }
    return null;
}
function webPath(absFile) {
    return '/' + path.relative(DIST, absFile).split(path.sep).join('/');
}

const assetsDir = path.join(DIST, 'assets');
const ionicons = findFile(assetsDir, /^Ionicons\..*\.ttf$/i);
const spaceMono = findFile(assetsDir, /^SpaceMono.*\.ttf$/i);

// Declare the fonts up front so the browser loads them declaratively.
// iOS Safari doesn't reliably apply expo-font's runtime FontFace loads in
// a static/standalone build, which left icons + text as empty glyphs.
// font-display:block on the icon font avoids a flash of fallback boxes.
let fontFaces = '';
if (ionicons) {
    fontFaces += `@font-face{font-family:'Ionicons';src:url('${webPath(ionicons)}') format('truetype');font-display:block;}`;
    console.log('[inject-pwa-head] Ionicons font:', webPath(ionicons));
} else {
    console.warn('[inject-pwa-head] WARNING: Ionicons ttf not found in dist/assets — in-app icons may not render.');
}
if (spaceMono) {
    fontFaces += `@font-face{font-family:'SpaceMono';src:url('${webPath(spaceMono)}') format('truetype');font-display:swap;}`;
}
const FONT_STYLE = fontFaces ? `    <style id="piqabu-fonts">${fontFaces}</style>\n` : '';

// --- Head tags: PWA manifest + iOS install meta -------------------------
const HEAD_TAGS = FONT_STYLE + `    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#060709" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Piqabu" />
  </head>`;

// Upgrade the viewport for edge-to-edge fullscreen on notched iPhones,
// and interactive-widget=resizes-content so the on-screen keyboard resizes
// the layout instead of overlaying/scrolling the page under it.
html = html.replace(
    /<meta name="viewport"[^>]*\/>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content" />',
);

// Insert the font + PWA + iOS tags immediately before </head>.
html = html.replace('</head>', HEAD_TAGS);

// Bootstrap script: pin the app to the visual viewport (keyboard fix),
// register the service worker + request persistent storage (so iOS stops
// evicting the onboarding flag / ghost id between launches).
const BOOT_SCRIPT = `    <script>
      (function () {
        var vv = window.visualViewport;
        if (vv) {
          function apply() {
            var h = vv.height;
            document.documentElement.style.height = h + 'px';
            if (document.body) document.body.style.height = h + 'px';
          }
          vv.addEventListener('resize', apply);
          vv.addEventListener('scroll', apply);
          window.addEventListener('orientationchange', function () { setTimeout(apply, 300); });
          apply();
        }
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
          });
        }
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(function () {});
        }
      })();
    </script>
  </body>`;
html = html.replace('</body>', BOOT_SCRIPT);

fs.writeFileSync(INDEX, html, 'utf8');
console.log('[inject-pwa-head] Injected fonts + PWA manifest + iOS meta + boot script into dist/index.html');
