# Piqabu — Web / PWA build

The Android app can also run as a **web app (PWA)** via Expo's web target
(`react-native-web`). This is used for UI/logic testing on devices that
can't run the APK (e.g. iPhone). It reuses the entire existing app — no
separate codebase.

> **This has zero effect on the Android app.** All web behaviour lives in
> web-only branches (`Platform.OS === 'web'`) or `*.web.tsx` files that
> Metro only loads for web. Android builds and OTA are untouched.

---

## Build

```bash
cd client
npm run build:web
```

This runs `expo export --platform web` and then `scripts/inject-pwa-head.js`,
producing a static site in **`client/dist/`** containing:

- the full app bundle + assets,
- `manifest.json` + `icon.png` (PWA install metadata),
- `_redirects` (SPA fallback so client-side routes don't 404),
- `index.html` with the iOS "Add to Home Screen" meta tags injected.

Rebuild any time the app code changes — just re-run `npm run build:web`.

---

## Deploy (Netlify — recommended)

`dist/` is a plain static site. Netlify is the simplest host and gives an
HTTPS URL (required: iOS needs a secure context for camera/mic + storage).

### Option A — drag-and-drop (no CLI)

1. Go to <https://app.netlify.com> and sign in.
2. **Add new site → Deploy manually** (or use the drag-drop zone on the
   Sites page).
3. Drag the **`client/dist`** folder onto the drop zone.
4. Netlify returns a URL like `https://<random>.netlify.app`.

The random subdomain is unguessable — effectively private for personal
testing. Rename it under **Site configuration → Change site name** if you
want something tidier.

To update later: re-run `npm run build:web`, then drag `dist` onto the
site's **Deploys** tab.

### Option B — CLI

```bash
cd client
npx netlify deploy --dir dist --prod
```

First run authorizes + links a site in the browser once; after that it's a
single command per deploy.

> **Not Render.** The Piqabu server lives on Render as a web *service*, not
> static hosting. Use Netlify for the PWA.

---

## Install on iPhone (for the user)

1. Open the Netlify URL **in Safari** (must be Safari for Add-to-Home-Screen
   on iOS — not Chrome).
2. **Share → Add to Home Screen → Add.**
3. A "Piqabu" icon appears; tapping it opens **fullscreen**, like a real app.
4. Walk through consent + onboarding, then Generate/Join a code exactly like
   the Android app. To share a room, one side generates a code and the other
   enters it (or opens the code link).

---

## What works on web vs. what can't

The app is web-ready: WebRTC audio/video use browser APIs, identity falls
back to `crypto.randomUUID`, and storage falls back to `localStorage`.

**Works on the PWA:**

- Rooms — generate/join, codes, deep-links, multi-channel
- Live text sync + Vanish text
- Reveal / Peek — images, video, PDF, gallery, show/cover
- Whisper — WebRTC push-to-talk audio *(HTTPS required)*
- Live Glass — WebRTC live video *(HTTPS required)*
- Onboarding, Consent, Settings, Donate UI, Feature Guide

**Can't work in a browser (inherent web/iOS limits, not a bug):**

- Piqabu Keyboard (IME) — not a web capability
- Live Mirror (screen share) — `getDisplayMedia` unsupported on iOS Safari
- Screenshot blocking (FLAG_SECURE) — no web API exists
- Biometric lock / panic gesture — no equivalent; disabled on web
- Hardened storage — uses `localStorage` instead of Keychain-backed store

---

## Server / CORS

The web app talks to `CONFIG.SIGNAL_TOWER_URL` (the Render server). The
server sets `cors: { origin: '*' }` for both Express and Socket.IO, so the
PWA connects from any origin — no extra config needed.

---

## How the web build is wired (for maintainers)

- **`components/DocumentViewer.web.tsx`** — Metro picks this on web, keeping
  the native-only `react-native-pdf` out of the web bundle (browsers render
  PDFs in an `<iframe>`).
- **`app/_layout.tsx`** — web doesn't block first paint on the SpaceMono
  font (`if (!loaded && Platform.OS !== 'web')`), otherwise the splash never
  resolves and the page is blank. Native still holds the splash.
- **`lib/uploadFile.ts`** — web branch posts a real `Blob` (RN's
  `{ uri, name, type }` FormData shape isn't understood by browsers).
- **`lib/platform/storage.ts`** — `localStorage` fallback on web.
- **`public/`** — `manifest.json`, `icon.png`, `favicon.png`, `_redirects`
  are copied to the web root on export.
- **`scripts/inject-pwa-head.js`** — post-export patch that injects the
  manifest link + Apple standalone meta tags into `dist/index.html`
  (single-output web export ignores `app/+html.tsx`, so this runs instead).
  Idempotent.
