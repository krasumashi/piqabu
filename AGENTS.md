# Piqabu agent guide

This repository is the durable source of truth for Piqabu. Read this file and the documents in `docs/` before changing or deploying the project.

## Product intent

Piqabu is an ephemeral messaging platform. Preserve its privacy model: room membership, minted codes, and WebSocket presence are intentionally short-lived; uploaded files are temporary; persistent operational records are limited to the JSON stores described in `docs/ARCHITECTURE.md`.

## Repository map

- `client/`: Expo/React Native app for iOS, Android, and web.
- `server/`: Node.js, Express, and Socket.IO Signal Tower API.
- `mission-control/`: React/Vite operator console served by the backend.
- `landing-site/`: static Cloudflare Pages site for `piqabu.live`.
- `landing-assets/`: legal and platform-association source assets.
- `ops/vultr/`: target Vultr deployment scripts and service definition.
- `.github/workflows/`: phone-triggerable deployment, OTA, and SideStore workflows.
- `scripts/`: release and maintenance helpers.
- `specs/`: product specifications and parked proposals.
- `docs/`: architecture, operations, decisions, and secret inventory.

## Durable documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations and phone control](docs/OPERATIONS.md)
- [Decision log](docs/DECISIONS.md)
- [Secrets and credentials](docs/SECRETS.md)

Update the relevant document whenever a change alters a domain, provider, runtime, deployment procedure, secret name, data location, native identifier, or release channel.

## Non-negotiable safeguards

- Never commit passwords, private keys, API secrets, access tokens, recovery codes, or complete environment files. Record only variable names and storage locations.
- Treat any credential pasted into a chat, issue, log, or screenshot as exposed and rotate it.
- Production client traffic uses `https://api.piqabu.live`; do not restore provider-specific URLs.
- Do not casually change the Apple Team ID, bundle/package ID, Expo project ID, runtime version, URL scheme, associated domains, or EAS channels.
- Distinguish an Expo OTA update from a native build. Native modules, permissions, identifiers, icons, entitlements, and runtime changes require a new binary.
- Do not deploy uncommitted local files or an ambiguous branch. Deploy an exact reviewed commit SHA.
- Require explicit operator confirmation before production deployment, DNS changes, credential rotation, data deletion, or release submission.
- Back up the configured `DATA_DIR` before any backend migration or destructive maintenance.
- Preserve working production infrastructure until its replacement passes health, admin, payment, WebSocket, and TURN checks.

## Local commands

Use Node.js 20 where practical, matching GitHub Actions.

### Client

```powershell
cd client
npm ci
npm run start
npm run build:web
```

The repository currently has pre-existing TypeScript errors around NativeWind `className` types and related client code. Do not describe the client type-check baseline as clean until those errors are separately resolved.

### Server

```powershell
cd server
npm ci
npm start
node --check server.js
```

Use `npm run dev` only when `nodemon` is available from the development dependencies.

### Mission Control

```powershell
cd mission-control
npm ci
npm run type-check
npm run build
```

## Verification by change type

| Changed area | Minimum verification |
| --- | --- |
| `client/` JavaScript or assets | Relevant lint/type checks where usable, launch affected platform, verify API connectivity; decide OTA versus native build |
| Native config or dependencies | New EAS binary, install/test on the affected platform, then submit or distribute |
| `server/` | `node --check` on changed JavaScript, start locally where possible, `/health`, affected API route, WebSocket room flow |
| Payments | Donation initialization, callback/deep link, status verification, webhook signature path; never log the secret |
| TURN/WebRTC | `/ice-servers` returns usable entries and a real cross-network session connects |
| `mission-control/` | `npm run type-check`, `npm run build`, login at the production root URL, affected screen |
| `landing-site/` | Check links, forms, redirects, platform association files, and responsive rendering |
| Deployment or DNS | Record current state, deploy exact SHA, health check, smoke test, document rollback |
| Documentation only | Verify local links, `git diff --check`, and absence of secret values |

## Deployment reality

Production currently runs on an Alpine/OpenRC Vultr instance using a manually installed service. The checked-in `ops/vultr/` scripts and `.github/workflows/deploy-vultr.yml` describe a systemd-style target and are not yet verified against that live host. Do not trigger the Vultr workflow until the host and workflow are aligned. See `docs/OPERATIONS.md`.

## Handoff standard

Every completed change should state:

1. the exact commit and branch;
2. what was validated and what was not;
3. whether production changed;
4. any required secret, dashboard, or store action;
5. the safe rollback path.
