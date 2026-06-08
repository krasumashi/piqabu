# Piqabu Mission Control

Operator dashboard for Piqabu — separate React + TypeScript SPA, calls the existing `/admin/*` endpoints on the Piqabu server. Designed to live at `admin.piqabu.live` (Netlify).

## Status

| Phase | Surface | State |
|---|---|---|
| 1 | Login, Pulse, Devices, Helpdesk (read-only) | ✅ Scaffolded |
| 2 | Helpdesk reply, Levers (maintenance / broadcast / kill-switch / tier), Audit log | 🔧 Stubs in place |

## Local dev

```bash
cd mission-control
npm install
# Make sure the Piqabu server is running locally (server/server.js on :3000)
# and ADMIN_API_KEY is set in its env. The Vite dev server proxies /admin
# and /socket.io to localhost:3000 so login + data calls work.
npm run dev
```

Open <http://localhost:5174>. Use the `ADMIN_API_KEY` env value as the login key.

If you want to point at the Render server instead of local, click ▸ API ENDPOINT on the login screen and paste `https://piqabu.onrender.com`.

## Production deploy (Netlify)

1. Push this folder to GitHub (the `mission-control/` subdir of the piqabu repo is fine).
2. In Netlify, **New site from Git** → pick the repo:
   - **Base directory:** `mission-control`
   - **Build command:** `npm run build`
   - **Publish directory:** `mission-control/dist`
3. Site settings → **Domain management** → add `admin.piqabu.live`. Cloudflare DNS gets a CNAME pointing at the Netlify subdomain.
4. **Environment variables** (Netlify build settings):
   - `VITE_API_BASE=https://piqabu.onrender.com`

That's it. Netlify rebuilds on every push to `main`.

## Auth

- Server-side: middleware in `server/routes/admin.js` checks `x-admin-key` against `ADMIN_API_KEY` env var on Render.
- Client-side: key entered at login lives in `sessionStorage` (clears on tab close). Every API call attaches it as a header.
- Tab close ≈ logout. Refresh keeps the session.

## What's missing for production

- HTTPS-only redirects (Netlify does this by default once a custom domain is attached).
- IP allow-listing on the `/admin/*` route on Render (optional second layer — easy add via Express middleware).
- 2FA for the operator key (Phase 3 — TOTP layer wrapping the existing `x-admin-key` check).

## File map

```
src/
├── main.tsx           ← entry, wraps in BrowserRouter
├── App.tsx            ← routes + RequireAuth guard
├── index.css          ← Tailwind base + brand grid background
├── lib/
│   ├── api.ts         ← fetch wrapper + sessionStorage key handling
│   └── time.ts        ← relativeTime / shortClock helpers
├── components/
│   ├── Layout.tsx     ← persistent shell, nav, log-out
│   ├── PulseDot.tsx   ← brand identity dot
│   └── StatCard.tsx   ← stat tile
└── routes/
    ├── Login.tsx      ← operator key entry + API base override
    ├── Pulse.tsx      ← Phase 1 — aggregate stats, 5s poll
    ├── Devices.tsx    ← Phase 1 — searchable Ghost ID list + drawer
    ├── Helpdesk.tsx   ← Phase 1 — feedback inbox (read-only)
    ├── Levers.tsx     ← Phase 2 stub
    └── Audit.tsx      ← Phase 2 stub
```
