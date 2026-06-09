# Releasing Piqabu

How to ship an APK to users via GitHub Releases.

## The stable URL

```
https://github.com/krasumashi/piqabu/releases/latest/download/piqabu.apk
```

This URL never changes. GitHub redirects `/latest/download/<filename>` to whatever the most recent release's matching asset is. Mission Control's Update Lever has it pre-filled.

## One-time setup

Install the GitHub CLI and authenticate. You only do this once per machine.

```bash
# Windows
winget install --id GitHub.cli

# macOS
brew install gh

# Then on any platform
gh auth login
```

Select **GitHub.com**, **HTTPS**, login with browser. Pick the `krasumashi/piqabu` repo when asked.

## Releasing

```bash
# 1. Build a new APK on EAS (you already do this for every release).
cd client
eas build --profile preview --platform android

# 2. Wait for the build to finish. Then from the repo root:
./scripts/release-apk.sh v0.2.0 "Bug fixes and IME paywall."
```

The script:

1. Finds the most recent **finished** Android EAS build.
2. Downloads its APK to `./piqabu.apk` (gitignored).
3. Tags the current commit with `v0.2.0` and pushes the tag.
4. Creates a GitHub Release at that tag with the APK attached as `piqabu.apk`.
5. Deletes the local APK.

## Pushing the notice to users

Once the release is up, open Mission Control → **Levers** → **Push update notice**.

- Mode: **SOFT** for "you should update" or **HARD** for "you must update".
- Action: **BOTH** (default) — tries Live OTA first, falls back to the APK URL.
- Title / message: whatever the user sees.
- Target version: `0.2.0` (optional).
- APK URL: pre-filled with the stable URL above.

Hit **PUSH NOTICE** → every connected device sees the banner / wall. Users who tap UPDATE get OTA'd (for JS changes) or open the GitHub release in their browser (for native changes that need a fresh APK).

## Picking a specific build

If you want to release an older build instead of the most recent:

```bash
./scripts/release-apk.sh v0.2.0 "Notes" --build-id <build-id>
```

Find the build id in `eas build:list` output or on https://expo.dev.

## Cleaning up

If `release-apk.sh` failed partway and left a `piqabu.apk` in the repo root, just `rm piqabu.apk`. It's gitignored — won't accidentally get committed.
