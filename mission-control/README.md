# Piqabu Mission Control

> **Historical component notes:** the Render deployment details below are retained for context but no longer describe production. Current production is served from Vultr through `admin.piqabu.live`. Use [`docs/OPERATIONS.md`](../docs/OPERATIONS.md) for deployment and incident procedures and [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the current system map.

Operator dashboard for Piqabu — separate React + TypeScript SPA, **served by the Piqabu Node server itself** alongside the API.

## Status

| Phase | Surface | State |
|---|---|---|
| 1 | Login, Pulse, Devices, Helpdesk (read-only) | ✅ Working |
| 2 | Helpdesk reply, Levers (maintenance / broadcast / kill-switch / tier), Audit log | 🔧 Stubs |

## Where it lives

- **Production:** [https://admin.piqabu.live](https://admin.piqabu.live) (after DNS) or [https://piqabu.onrender.com/mission/](https://piqabu.onrender.com/mission/) directly.
- Same Render service, same Node process, same TLS cert as the API. No separate hosting.
- The Node server (`server/server.js`) serves `mission-control/dist` as static under `/mission/*`. When the request hostname is `admin.piqabu.live`, `/` rewrites to `/mission/` so visitors land cleanly.

## Local dev

```bash
# In one terminal — start the Piqabu API server
cd S:\piqabu\server
npm install
ADMIN_API_KEY=any-string-you-want node server.js

# In another terminal — start the Mission Control dev server
cd S:\piqabu\mission-control
npm install
npm run dev
```

Open <http://localhost:5174>. Vite proxies `/admin/*` and `/socket.io/*` to your local Node server. Log in with whatever you set `ADMIN_API_KEY` to.

## Production deploy

Already wired into `server/render.yaml`:

```yaml
buildCommand: |
  npm install
  cd ../mission-control && npm install && npm run build
```

Every push to `main` triggers Render to:

1. `npm install` in `server/`
2. `cd ../mission-control && npm install && npm run build` → produces `mission-control/dist/`
3. Start `node server.js` — which serves the freshly-built SPA at `/mission/`

### One-time domain setup

1. In your Cloudflare DNS for `piqabu.live`:
   - Add a `CNAME` record: `admin` → `piqabu.onrender.com` (or whatever Render shows as the target)
2. In the Render dashboard for the `piqabu-signal-tower` service:
   - Settings → Custom Domains → add `admin.piqabu.live`
   - Render provisions a free Let's Encrypt cert automatically

After DNS propagates (~5 minutes), `admin.piqabu.live` serves the dashboard.

## Auth

- Server: middleware in `server/routes/admin.js` checks the `x-admin-key` header against the `ADMIN_API_KEY` env var on Render.
- Client: key entered at login is held in `sessionStorage` and attached to every API call. Tab close clears it.
- This is operator-grade enough for now. Phase 3 wraps the key check in TOTP for stronger MFA.

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
