# Piqabu Institutional Tier — Spec (draft for later)

> Status: **parked**. Not built. When ready, the founder says go → re-read
> this → confirm/adjust → then phase it. Pricing/currency depend on what
> Paystack enables for the account (still pending their reply as of
> 2026-06-18).

## Why this exists

The consumer app is **free-for-individuals / freemium** by design — that
maximises adoption and the two-sided network (people invite people). The
money should come from **organisations**, not from squeezing individuals.
Institutions both *need* secure, ephemeral, no-trace comms and *have
budgets*. So: individuals free(ish), institutions pay real money.

This is also where infra cost is recovered — video/screen-share TURN relay
(Metered bandwidth) and media storage are the expensive parts, and orgs are
the heavy users.

## Who it's for

- **Newsrooms / journalists** — source protection, ephemeral drops.
- **NGOs / human-rights / activist collectives** — coordination under risk.
- **Law / medical / finance** — confidential client comms, no retention.
- **SMEs** needing private internal channels without a Slack-style archive.

## The hard rule (do not violate)

**Institutional admin powers are about provisioning, billing, and policy —
NEVER about reading members' messages.** Piqabu's whole promise is no-trace,
no-archive. An org tier that let admins read employee chats would betray
the product and the users it's meant to protect. Admins manage *seats and
settings*, not *content*. Keep E2E/ephemeral intact for everyone.

## What an org gets (over individual Pro)

- **Seats** — buy N seats; assign/revoke to member Ghost IDs. All Pro
  features unlocked for seated members.
- **Multi-room** — the feature we pulled from consumer Pro lives here:
  multiple simultaneous channels (e.g. up to 5+), the natural team need.
- **Org admin console** — likely an extension of Mission Control (operator
  already exists): manage seats, see seat usage (counts only, never
  content), set org-wide policy defaults.
- **Policy controls** — org defaults for vanish timers, allowed features,
  device-link rules. Policy, not surveillance.
- **Priority relay / higher media limits** — better TURN priority, larger
  Reveal file sizes / slightly longer auto-delete window — the cost-driven
  knobs.
- **Billing** — annual invoice or Paystack, per-seat. Possibly volume
  breaks. Tax-invoice/receipt support (orgs need paperwork).
- **(Maybe) light branding** — org name on the consent/handshake screen.
- **(Maybe later) SSO / domain provisioning** — enterprise ask; defer.

## Architecture notes (reuse what exists)

- **Ghost ID** already identifies devices; **subscriptionStore** already
  maps deviceId → entitlement; **Mission Control** is already the operator
  console. An "Org" is a new entity grouping deviceIds with a seat count.
- New server concept: `orgs` store — `{ orgId, name, seats, seatedDeviceIds[],
  plan, billingRef, policyDefaults }`. Entitlement resolution: a device is
  Pro if it has a personal sub OR is seated in an active org.
- Admin assigns seats by Ghost ID (member shares their ID, or an invite
  code flow). Reuse the existing device registry + Levers UI patterns.
- Keep it on the same Render/Paystack stack; orgs likely invoice-billed
  (manual/Levers) at first, automated later.

## Pricing shape (to decide with Paystack currencies confirmed)

- **Per-seat / year**, annual. Placeholder thinking only — not set:
  e.g. individual Pro stays ₵300/yr; institutional maybe ~$X/seat/yr with
  a small-team minimum (e.g. 3 seats) and volume discounts above N seats.
- Mission/NGO/press discount or grant track (aligns with the privacy
  mission and grant-funding angle).
- Currency: same constraint as consumer — Paystack charges one currency
  per transaction that the account must support; confirm before pricing.

## Phasing (when greenlit)

1. **Org entity + seat model** server-side (`orgs` store; entitlement =
   personal OR seated). Admin grants seats via Mission Control.
2. **Multi-room** re-enabled for seated members (consumer stays single-room).
3. **Org policy defaults** (vanish/feature/device rules).
4. **Self-serve admin console** + invite-code seat assignment.
5. **Priority relay / media limits**; billing automation; (later) SSO.

## Open questions for the founder (answer when we build)

- Seat assignment: invite codes, or members submit Ghost ID to an admin?
- Minimum seats + price point per seat (after Paystack currency answer)?
- Is multi-room institutional-only, or also a high consumer tier?
- Any branding on consent/handshake for orgs, or keep it uniformly neutral?
- Grant/discount track for press & NGOs — yes/no for launch?
- Invoice billing first (manual via Levers) vs self-serve checkout?
