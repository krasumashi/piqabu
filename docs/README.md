# Piqabu documentation

These documents are the long-lived operational memory for the project. They are designed to be readable from GitHub and usable from a paired phone without relying on one Codex conversation.

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Components, domains, data flows, persistence, and trust boundaries |
| [Operations](OPERATIONS.md) | Phone-first change, release, deployment, incident, backup, and rollback procedures |
| [Decisions](DECISIONS.md) | Accepted constraints and the reasoning behind them |
| [Secrets](SECRETS.md) | Credential names, owners, storage locations, and rotation procedures without values |
| [Agent guide](../AGENTS.md) | Rules and verification requirements for Codex and other contributors |

## Source-of-truth order

When sources disagree, use this order and fix the stale source:

1. observed production behavior and current provider configuration;
2. code and workflows in the deployed commit;
3. these durable documents;
4. component READMEs and historical provider files;
5. old chat messages, screenshots, and remembered procedures.

The live host currently differs from the checked-in Vultr target deployment. That exception is recorded prominently in [Operations](OPERATIONS.md#current-vultr-state-and-target-state).

## Maintenance rule

Update these files in the same commit as any architectural or operational change. Never add real secret values. Use dates in `YYYY-MM-DD` format and link decisions from the affected runbook section.

Last reconciled with the repository and observed deployment: 2026-07-18.
