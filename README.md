# Piqabu

Piqabu is an ephemeral messaging platform with Expo mobile clients, a Node.js/Socket.IO Signal Tower, an operator Mission Control console, and a static landing/distribution site.

## Live surfaces

- Landing and downloads: [piqabu.live](https://piqabu.live)
- Signal Tower API: [api.piqabu.live](https://api.piqabu.live)
- Mission Control: [admin.piqabu.live](https://admin.piqabu.live/)

## Start here

- Contributors and Codex: [AGENTS.md](AGENTS.md)
- Documentation index: [docs/README.md](docs/README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Phone-first operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Decision log: [docs/DECISIONS.md](docs/DECISIONS.md)
- Secret inventory: [docs/SECRETS.md](docs/SECRETS.md)

## Important deployment note

The working Vultr origin currently uses Alpine/OpenRC. The checked-in automated Vultr deployment assumes a systemd-style target and must not be triggered until the host and workflow are aligned. The exact migration guardrails and rollback plan are in [Operations](docs/OPERATIONS.md#current-vultr-state-and-target-state).

Never add secret values to this repository. Record names and storage locations only.
