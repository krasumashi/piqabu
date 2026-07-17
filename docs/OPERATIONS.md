# Operations and phone control

This runbook is written for an operator using the Codex phone pairing, GitHub mobile/web, Cloudflare, Expo, App Store Connect, and Vultr consoles. GitHub is the durable handoff point: make changes on a branch, review the diff, record validation, and deploy an exact commit.

## Quick status checks

Use these before and after any production action:

| Check | Expected result |
| --- | --- |
| `https://api.piqabu.live/health` | HTTP 200 and an active health response |
| `https://piqabu.live` | Landing page loads over HTTPS |
| `https://admin.piqabu.live/` | Mission Control login loads from the root URL |
| App room smoke test | Two clients can create/join and see presence |
| `/ice-servers` through the app | TURN entries when Cloudflare credentials are healthy; STUN fallback otherwise |
| Donation smoke test | Initialization opens Paystack and return path resumes the correct platform |

Do not include an admin key, payment secret, TURN token, or full environment output in a screenshot or health report.

## Change classification

Classify the change before releasing it:

| Change | Delivery path |
| --- | --- |
| Compatible React/TypeScript logic, copy, or bundled asset | Expo OTA to `preview`, test, then `production` |
| Native dependency, permission, entitlement, identifier, scheme, icon, or runtime | New EAS native binary |
| Signal Tower or Mission Control | Vultr deployment after state backup |
| Landing site, redirect, association file, or legal page | Cloudflare Pages deployment |
| DNS, TLS, proxy, WAF, Pages binding, or TURN account config | Cloudflare dashboard/API with before-and-after record |
| Secret value | Rotate in its authoritative secret store, restart/redeploy consumer, verify, then revoke old value |

## Phone-first workflow

1. Continue this Codex task from the paired phone or open a new task and point it to this repository.
2. Ask Codex to read `AGENTS.md` and `docs/README.md` before acting.
3. Work on a named branch. Keep unrelated local edits out of the change.
4. Review the diff and validation evidence from the phone.
5. Commit and push so the change and its context survive any device or chat loss.
6. Trigger only the workflow appropriate to the change.
7. Watch the workflow log and run the production checks above.
8. Record the deployed commit, outcome, and any manual dashboard action in the handoff or decision log.

For a brand-new software project, create a separate repository with its own `AGENTS.md`, architecture, operations, decisions, and secrets inventory. Do not mix unrelated products into this repository merely to preserve chat context.

## Expo OTA from a phone

Repository workflow: `.github/workflows/expo-ota.yml`.

Required GitHub Actions secret: `EXPO_TOKEN`.

1. Open the repository in GitHub mobile or a phone browser.
2. Open **Actions**, then **Expo OTA Update**.
3. Choose **Run workflow**.
4. Select `preview` and enter a message containing the commit and purpose.
5. Wait for success, open the preview build, and test launch, API connection, deep links, and the changed behavior.
6. Repeat for `production` only after preview passes.

An OTA does not upload a new binary to Apple and therefore does not change the App Store Connect upload date. The current native identity is version `1.0.2`, build `5`; compatibility is controlled by runtime version `1.0.0`.

## iOS distribution

### TestFlight

TestFlight is the primary beta channel. Signed builds are currently managed through Expo/EAS and App Store Connect; there is no checked-in GitHub workflow that creates and submits a signed TestFlight build end to end.

The `testflight` EAS profile uses the `preview` channel and auto-increments the build number. Native changes require a new EAS build and submission. JavaScript-only changes compatible with runtime `1.0.0` can use the preview OTA without a new upload.

External TestFlight users join through `https://testflight.apple.com/join/ZQjMEVCC`. Internal testers still require App Store Connect membership; they cannot be converted into public anonymous testers.

### SideStore

Repository workflow: `.github/workflows/ios-sidestore.yml`.

The workflow creates an unsigned SideStore-compatible IPA and updates the fixed `ios-latest` GitHub prerelease plus `apps.json`. It is an additional distribution route, not an App Store replacement. Confirm `https://piqabu.live/apps.json` and the IPA URL after each run.

## Android distribution

The stable landing-page URL expects the asset `piqabu.apk` in the latest GitHub release. Current APK release instructions are in `RELEASING.md` and rely on a development environment.

A phone-triggerable signed Android EAS build and GitHub-release publication workflow is not yet checked in. Until that gap is implemented and validated, do not tell users that Android production can be rebuilt entirely from the phone.

## Landing site and Cloudflare Pages

The landing source is `landing-site/`. Cloudflare Pages project bindings, production branch selection, and build settings live in Cloudflare rather than in this repository, so inspect them before assuming which branch auto-deploys.

After a site deployment, verify:

- home, iPhone, Android, privacy, terms, and upgrade pages;
- Formspree submission to `https://formspree.io/f/mgorlgve`;
- Android, public TestFlight, and SideStore download links;
- `/.well-known/apple-app-site-association` or the configured equivalent;
- `/.well-known/assetlinks.json` or the configured equivalent;
- redirect behavior for `/apps.json` and payment callbacks.

## Current Vultr state and target state

### Current live state

As observed on 2026-07-16, the origin is a Vultr free-tier Alpine Linux instance in Frankfurt. The application was installed manually under `/opt/piqabu`, runs as an OpenRC service named `piqabu`, and reads a root-only environment file at `/etc/piqabu.env`. Retrieve the current origin address from the protected Vultr/Cloudflare configuration rather than publishing it in repository documentation.

This is the currently working production state. Preserve it until a replacement is proven.

### Checked-in target state

`ops/vultr/deploy-piqabu`, `ops/vultr/piqabu.service`, and `.github/workflows/deploy-vultr.yml` describe a different deployment model:

- systemd service management with `systemctl`;
- releases and a `current` symlink under `/srv/piqabu`;
- root-only environment file `/etc/piqabu/piqabu.env`;
- persistent state under `/var/lib/piqabu`;
- deployment of an exact 40-character commit SHA;
- rollback through an atomic symlink change;
- GitHub SSH secrets for remote execution.

### Safety status: do not trigger yet

The GitHub Vultr workflow is not verified against the current Alpine/OpenRC host. It calls `sudo -n /usr/local/sbin/deploy-piqabu` and the checked-in deploy script calls `systemctl`. Triggering it before alignment may fail or leave a partial release.

Choose and validate one of these migrations before enabling phone deployments:

1. provision a supported systemd host and rehearse the checked-in target there; or
2. rewrite the target service and deploy helper for Alpine/OpenRC, with equivalent atomic releases and rollback.

The migration must copy and validate `DATA_DIR`, install secrets without exposing them, pass all smoke tests on a non-public origin, then switch Cloudflare. Keep the old origin available for rollback.

## Future Vultr deployment after alignment

Once the mismatch above is resolved and the runbook is updated:

1. verify the exact commit SHA and a clean GitHub Actions run source;
2. take an off-host backup of `DATA_DIR`;
3. make sure the selected workflow branch has the reviewed commit at its head;
4. open **Actions** → **Deploy API to Vultr**, select that branch, and run it; the workflow deploys its automatically captured full `github.sha`;
5. watch SSH, install, build, service restart, and health-check steps;
6. verify health, room flow, Mission Control, TURN, donation init, and callback;
7. record the deployed SHA.

Required GitHub Actions settings are listed in [Secrets](SECRETS.md#github-actions).

## Backup and restore

### What to back up

Back up the directory named by the live `DATA_DIR` value. It contains JSON operational state. Do not print the whole environment file to discover it; query only the variable name with output redacted or inspect it in a protected root session.

R2 is activated but is not currently an application store or backup destination. Backups must leave the instance through a separately secured mechanism.

### Backup acceptance criteria

- the archive is stored off the Vultr instance;
- file ownership and permissions are recorded;
- the archive is encrypted or held in a private managed store;
- a test restore can parse all JSON files;
- backup time and deployed commit are recorded.

### Restore outline

1. stop writes or place the backend in a maintenance window;
2. preserve the damaged/current directory separately;
3. restore files into the configured `DATA_DIR` with service ownership;
4. validate JSON syntax without printing contents;
5. restart the service;
6. verify health, admin status, device/donation counts, and a room flow.

## Incident playbooks

### API or Socket.IO unavailable

1. Check Cloudflare DNS/proxy status and `https://api.piqabu.live/health`.
2. Check the Vultr instance state and service status. On the current host use OpenRC; do not use systemd commands.
3. Read recent service logs without dumping environment variables.
4. Confirm disk, memory, Node process, listening port, and origin reachability.
5. If the last deployment caused the issue, roll back to the prior known commit and re-run health and room checks.

An application restart clears active ephemeral rooms and codes; communicate that impact before restarting when possible.

### Donation initialization returns 500

1. Confirm the server has `PAYSTACK_SECRET_KEY` and the service was restarted after installation.
2. Check backend logs for the Paystack HTTP status and sanitized error message.
3. Confirm `PAYSTACK_CALLBACK_URL` and the platform-specific return path.
4. Verify Paystack live/test mode consistency; do not paste the secret into a client, issue, or log.
5. Test initialization with the minimum permitted amount, then verify status and webhook handling.

### iOS payment does not return to the app

Confirm the deployed client uses `piqabu://upgrade`, the `piqabu` scheme exists in the native binary, and the installed build is compatible with the OTA. A scheme or native configuration change requires a new TestFlight build.

### Mission Control rejects the key

1. Start at `https://admin.piqabu.live/`, not a refreshed `/login` deep link.
2. Use endpoint `https://api.piqabu.live` only when the UI asks for a separate API; otherwise prefer same-origin.
3. Confirm the browser sends `x-admin-key` and the server’s `ADMIN_API_KEY` is installed.
4. If rotating, install the new value, restart, verify a new session, then revoke the old value.

The UI may still contain historical Render wording. That label is stale; production is Vultr.

### TURN unavailable

1. Check the backend’s `/ice-servers` response without exposing credential fields in a public log.
2. Confirm `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` are present and valid.
3. Check Cloudflare Calls/TURN service status and token permissions.
4. Re-test with clients on different networks. STUN fallback does not prove TURN works.

## Rollback rules

- OTA: publish the last known-good compatible commit to the affected branch; do not change runtime version as a shortcut.
- Native: restore the previous TestFlight/build group or distribute a new corrected build; an OTA cannot reverse incompatible native configuration.
- Backend: restore the prior release and keep the same verified `DATA_DIR`; never overwrite state with repository files.
- Landing: redeploy the previous Cloudflare Pages commit and recheck redirects/forms.
- DNS/origin migration: switch Cloudflare back to the preserved origin only after confirming its service and state are still valid.
- Secret rotation: keep the old credential only for the shortest overlap necessary, verify the new one, then revoke the old one.

## Known operational gaps

- Vultr GitHub deployment is not aligned with the live OpenRC host.
- There is no repository workflow for a signed TestFlight build/submission.
- There is no repository workflow for a signed Android build plus stable GitHub release asset.
- JSON state has no automated off-host backup or database replication.
- R2 is not integrated.
- CORS is permissive despite an `ALLOWED_ORIGINS` setting.
- Mission Control contains stale Render wording and direct friendly deep links may fail on refresh.

Treat these as planned work, not silently completed capabilities.
