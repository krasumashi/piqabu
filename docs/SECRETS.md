# Secrets and credentials

This file records credential names and storage locations only. It must never contain live values, private-key bodies, recovery codes, passwords, or complete environment-file output.

## Rules

- A value pasted into a chat, issue, terminal log, screenshot, or commit is exposed; rotate it.
- Keep runtime secrets on the server and automation secrets in the provider’s encrypted secret store.
- Client builds may contain public identifiers and explicitly public keys only. A variable name containing `PUBLIC` does not make an arbitrary secret safe.
- Grant the narrowest provider permissions and use different credentials for unrelated systems.
- Record the owner, installation date, last rotation date, and next review in a private password manager or secret manager.
- Never test a secret by putting it into a URL or command that will be preserved in shell history.

## Live backend environment

Current Alpine/OpenRC production reads a root-only environment file at `/etc/piqabu.env`. The checked-in systemd target expects `/etc/piqabu/piqabu.env`. Both paths must remain mode-restricted and readable only by the appropriate administrator/service context.

| Name | Purpose | Requirement and rotation note |
| --- | --- | --- |
| `ADMIN_API_KEY` | Protects `/admin/*` and Mission Control | Required for admin access. Historically shared in an operator conversation; rotate before broader use. |
| `PAYSTACK_SECRET_KEY` | Initializes and verifies Paystack transactions | Required for live donations. Historically shared in an operator conversation; rotate, restart, verify init/webhook, then revoke the old value. |
| `PAYSTACK_CALLBACK_URL` | Server-authorized payment callback | Configuration, not a secret. Keep consistent with accepted platform return flows. |
| `CLOUDFLARE_TURN_KEY_ID` | Identifies the Cloudflare TURN key | Treat as sensitive metadata; pair only with its intended token. |
| `CLOUDFLARE_TURN_API_TOKEN` | Obtains short-lived TURN credentials | Required for Cloudflare TURN. Rotate in Cloudflare and restart/verify `/ice-servers`. |
| `TURN_USERNAME` | Optional legacy/static TURN username | Optional fallback; remove when unused. |
| `TURN_CREDENTIAL` | Optional legacy/static TURN credential | Secret; remove when unused. |
| `APPLE_IAP_SHARED_SECRET` | Optional Apple receipt validation | Secret; required only if that legacy IAP path is active. |
| `APPLE_PRODUCT_ID` | Apple product identifier | Not normally secret, but configuration must match App Store Connect. |
| `STRIPE_SECRET_KEY` | Optional legacy Stripe server access | Secret; remove from production if Stripe is inactive. |
| `STRIPE_WEBHOOK_SECRET` | Optional Stripe webhook verification | Secret; remove if inactive. |
| `STRIPE_PRICE_MONTHLY` | Optional Stripe price configuration | Identifier, not a secret. |
| `STRIPE_PRICE_YEARLY` | Optional Stripe price configuration | Identifier, not a secret. |
| `STRIPE_SUCCESS_URL` | Optional Stripe redirect | Configuration, not a secret. |
| `STRIPE_CANCEL_URL` | Optional Stripe redirect | Configuration, not a secret. |
| `GITHUB_TOKEN` | Optional GitHub release-stat access from server | Prefer a fine-grained, read-only token; omit when public unauthenticated access is sufficient. |
| `GITHUB_RELEASES_OWNER` | GitHub stats owner | Configuration, not a secret. |
| `GITHUB_RELEASES_REPO` | GitHub stats repository | Configuration, not a secret. |
| `DATA_DIR` | Persistent JSON-state path | Configuration, not a secret. Back up the named directory off-host. |
| `PRO_PRICE_MINOR_UNITS` | Donation/subscription pricing configuration | Not a secret. Confirm currency and units together. |
| `PRO_PRICE_USD_CENTS` | Legacy pricing configuration | Not a secret; remove when definitively unused. |
| `PRO_CURRENCY` | Payment currency | Not a secret. |
| `ALLOWED_ORIGINS` | Intended CORS allow-list | Not a secret. Current server CORS remains permissive, so this is not presently an enforcement guarantee. |

Other ordinary service variables such as `PORT`, `NODE_ENV`, and upload limits are configuration, not credentials.

## GitHub Actions

Store these under repository or protected environment **Actions secrets and variables**. Production workflows should use a protected GitHub environment when available.

| Name | Store as | Consumer | Notes |
| --- | --- | --- | --- |
| `EXPO_TOKEN` | Secret | `.github/workflows/expo-ota.yml` | Expo token scoped to the correct account/project; rotate if workflow logs or access are suspect. |
| `VULTR_SSH_PRIVATE_KEY` | Secret | `.github/workflows/deploy-vultr.yml` | Dedicated deploy key, not a personal all-purpose key. The workflow is not safe to run until host alignment is complete. |
| `VULTR_SSH_KNOWN_HOSTS` | Secret or protected variable | Vultr workflow | Pin the correct host key; update only after verifying a legitimate host rebuild. |
| `VULTR_HOST` | Variable, or secret to hide topology | Vultr workflow | Current address is operational metadata, not authentication. |
| `VULTR_USER` | Variable | Vultr workflow | Use a least-privileged deploy account with narrowly scoped passwordless actions. |

GitHub’s automatically supplied workflow token should keep the minimum permissions declared by each workflow.

## Expo, Apple, and signing credentials

- EAS signing material and Apple authentication should remain in Expo’s credential store or Apple’s official systems, not in this repository.
- Apple Team ID `VL5QP7VU37`, App Store Connect app ID `6788590877`, bundle ID `com.krasumashi.piqabu`, and the Expo project ID are identifiers, not passwords.
- App Store Connect API private keys, issuer credentials, certificates, and provisioning-profile private material are secrets even when a workflow needs them.
- A TestFlight public link is public by design; internal tester membership and Apple account sessions are not.

## Cloudflare

Cloudflare account sessions, API tokens, origin credentials, and TURN tokens belong in Cloudflare or an encrypted automation store. Prefer narrowly scoped tokens for DNS, Pages, R2, or Calls rather than a global API key.

Formspree endpoint IDs, public DNS records, Apple association files, Android asset links, and the Paystack public key are public integration data, not secret storage.

## Rotation procedure

1. Identify every consumer and confirm the authoritative storage location.
2. Create a new credential with least privilege; do not revoke the old one yet if overlap is required.
3. Install the new value in the secret store without printing it.
4. Restart or redeploy only the consumers that require it.
5. Verify the exact path: admin login, donation init/webhook, TURN retrieval, Expo workflow, or SSH deployment.
6. Revoke the old value.
7. Check logs and provider audit events for unexpected use.
8. Record rotation date and owner privately; update this inventory only if names or locations changed.

## Immediate rotation register

As of 2026-07-16, the following credential classes were previously placed in an operator conversation and should be considered exposed:

- Paystack live secret;
- Mission Control admin API key;
- Vultr root/administrator password, if still active.

Rotate them without copying their old or new values into this file. Prefer disabling direct password-based root access after a verified SSH-key deploy account and recovery path exist.
