# Decision log

This is a lightweight architecture decision record. Append new decisions; do not rewrite history merely because implementation later changes. Mark superseded decisions and link the replacement.

## D-001: Project-owned production endpoints

- Date: 2026-07-16
- Status: accepted

Production clients use `api.piqabu.live`, the operator uses `admin.piqabu.live`, and public content uses `piqabu.live`. Provider-specific Render, Netlify, Vultr IP, or Pages hostnames must not become durable client endpoints.

Reason: project-owned names allow an origin migration without forcing another native app release.

## D-002: GitHub is the durable source of truth

- Date: 2026-07-16
- Status: accepted

Code, infrastructure helpers, workflows, and operational documentation live in GitHub. Chats and dashboards may help execute work but do not replace repository history.

Reason: the project must survive loss of a computer, phone, provider session, or Codex task.

## D-003: Cloudflare edge with Vultr application origin

- Date: 2026-07-16
- Status: accepted

Cloudflare provides DNS, proxy/TLS, Pages, and Calls TURN. Vultr runs the Signal Tower and serves Mission Control. Cloudflare R2 is available but not currently part of application storage.

Reason: this preserves stable public routing while keeping the stateful Node service on a general-purpose origin.

## D-004: Preview before production OTA

- Date: 2026-07-16
- Status: accepted

Compatible JavaScript changes publish first to the Expo `preview` branch and only then to `production`. Current runtime compatibility is `1.0.0`. Native changes require a new binary.

Reason: preview provides a real-device safety gate and prevents incompatible JavaScript from being sent broadly.

## D-005: TestFlight primary, SideStore additive

- Date: 2026-07-16
- Status: accepted

TestFlight remains the primary iOS beta path. SideStore is retained as an optional additional distribution route and must not be represented as Apple approval or App Store distribution.

Reason: TestFlight supplies the standard signed Apple testing route; SideStore can help availability but has a different trust and installation model.

## D-006: Platform-specific Paystack return paths

- Date: 2026-07-16
- Status: accepted

iOS donations return through `piqabu://upgrade`; Android uses `https://piqabu.live/upgrade`. The Paystack secret remains on the backend and payment completion is verified server-side.

Reason: the custom iOS scheme reliably resumes the installed app, while the web callback supports Android and public fallback behavior.

## D-007: Shared-key Mission Control for the early stage

- Date: 2026-07-16
- Status: accepted with security debt

Mission Control uses a server-side `ADMIN_API_KEY`, sent through `x-admin-key`, and stores it in browser `sessionStorage` for the current tab only.

Reason: it is a small early-stage operator surface. This does not provide individual identity, revocation, or an audit-quality authentication model and should be replaced before adding operators or high-risk controls.

## D-008: Flat JSON state during early testing

- Date: 2026-07-16
- Status: accepted with migration trigger

Subscriptions, donations, devices, and admin records remain JSON files under `DATA_DIR`. Ephemeral room state stays in memory.

Reason: this is adequate for the current small testing stage. Move to a transactional managed database before multi-instance deployment, meaningful revenue volume, concurrent writes, stronger audit requirements, or availability guarantees.

## D-009: Phone-first operations through reviewed workflows

- Date: 2026-07-16
- Status: accepted, partially implemented

Routine operations should be triggerable from GitHub, Expo, Cloudflare, Vultr, and App Store Connect on a phone. Each deployment must use a reviewed commit, named secrets, logs, health checks, and a rollback path.

The Expo OTA and SideStore workflows exist. Signed iOS and Android workflows are still missing, and the Vultr workflow is not aligned with the current OpenRC host.

## D-010: Do not cut over from a working origin without a rehearsal

- Date: 2026-07-16
- Status: accepted

The current Alpine/OpenRC service remains authoritative until the chosen automated deployment target is rehearsed with copied state and passes health, admin, payment, WebSocket, and TURN checks. DNS changes occur last, and the previous origin remains available for rollback.

Reason: a clean migration is safer than modifying the only working origin in place.

## D-011: R2 activation is not R2 integration

- Date: 2026-07-16
- Status: accepted

Cloudflare R2 must be documented as inactive for application uploads and backups until code, credentials, lifecycle rules, privacy behavior, and restore tests are implemented.

Reason: an enabled provider product is not a working or verified data path.

## D-012: Offline iOS keyboard with an explicit handoff

- Date: 2026-07-16
- Status: accepted, pending on-device validation

The iOS keyboard is a native Swift extension that mirrors the safe offline portion of the Android experience: normal text input, local MINT/RESET, universal-link insertion, keyboard switching, and a dedicated decoy key. It does not request Full Access, use the network or pasteboard, share a container, gate functionality behind payment, or launch the containing app.

After sending a minted link, the sender taps it to enter Piqabu. Onboarding and activation explain this iOS-only extra step. The Android Kotlin IME remains unchanged.

Reason: Apple requires keyboard extensions to remain functional without Full Access, provide normal keyboard input and switching, and not launch other apps. The offline design preserves Piqabu's privacy posture and reduces App Review risk. Any future in-keyboard networking or shared state requires a separate decision and privacy review.

## D-013: Media-safe Peek privacy on iOS

- Date: 2026-07-17
- Status: accepted with platform limitation

Android continues to use secure-window screenshot protection while Peek media is visible. iOS uses the app-switcher privacy overlay plus Piqabu's visible media watermarks, but does not invoke active screenshot blocking for Peek.

The current `expo-screen-capture` iOS implementation reparents the key window beneath a secure text-field layer. On the tested TestFlight runtime this blanked received images, video and PDF tiles, and their native rendering surfaces. Delivering the core communication feature reliably takes precedence over claiming screenshot prevention that makes the content unusable. Revisit active iOS screenshot protection only with a media-safe native implementation tested against React Native images, AVPlayer, PDFKit, modals, and current iOS releases.
