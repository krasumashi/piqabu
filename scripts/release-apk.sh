#!/usr/bin/env bash
#
# release-apk.sh
#
# One-shot script for publishing a Piqabu APK release on GitHub.
#
# Flow:
#   1. Find the most recent finished Android EAS build (assumes you
#      ran `eas build --profile preview --platform android` earlier).
#   2. Download its APK artifact to ./piqabu.apk.
#   3. Tag the current commit with vX.Y.Z and push the tag.
#   4. Create a GitHub release at that tag with the APK attached as
#      "piqabu.apk" — the stable filename means the URL
#         https://github.com/krasumashi/piqabu/releases/latest/download/piqabu.apk
#      always resolves to the latest release without ever needing to
#      change. This is what Mission Control's Update Lever's APK URL
#      field is pre-filled with.
#   5. Clean up the local APK.
#
# Prerequisites (one-time):
#   - GitHub CLI installed: https://cli.github.com/
#       Windows:  winget install --id GitHub.cli
#       macOS:    brew install gh
#   - Auth'd to the repo:    gh auth login
#   - EAS CLI installed + logged in (you already have this — used for
#     OTA all session).
#   - jq for JSON parsing (Git Bash ships with it; macOS: brew install jq).
#
# Usage:
#   scripts/release-apk.sh v0.2.0 "Bug fixes and IME paywall."
#
# Args:
#   $1  tag       (required, e.g. v0.2.0 — must match /^v\d+\.\d+\.\d+$/)
#   $2  notes     (optional release notes body; passed through to gh)
#
# If you want to release a SPECIFIC EAS build (not the most recent),
# pass --build-id <id> after the notes.
#

set -euo pipefail

TAG="${1:-}"
NOTES="${2:-Release ${TAG:-}.}"
BUILD_ID=""

# Parse --build-id <id> after the positional args
while [[ $# -gt 2 ]]; do
    shift
    case "${1:-}" in
        --build-id) BUILD_ID="${2:-}"; shift 2 ;;
        *) shift ;;
    esac
done

# ─── Validate ──────────────────────────────────────────────────────────
if [[ -z "$TAG" ]]; then
    echo "Usage: $0 <tag> [notes] [--build-id <id>]"
    echo "Example: $0 v0.2.0 \"Bug fixes\""
    exit 1
fi
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "✖ Tag must match vX.Y.Z (got: $TAG)"
    exit 1
fi
for cmd in gh eas jq curl git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "✖ '$cmd' not found on PATH. See script header for install hints."
        exit 1
    fi
done
if ! gh auth status >/dev/null 2>&1; then
    echo "✖ Not authenticated with GitHub CLI. Run: gh auth login"
    exit 1
fi

# ─── 1. Locate the EAS build ───────────────────────────────────────────
echo "→ Locating EAS Android build…"
cd "$(git rev-parse --show-toplevel)/client"

if [[ -n "$BUILD_ID" ]]; then
    BUILD_JSON="$(eas build:view "$BUILD_ID" --json)"
else
    # --limit 1 + status finished + platform android = the most recent
    # successful Android build for this project.
    BUILD_JSON="$(eas build:list --platform android --status finished --limit 1 --json --non-interactive)"
    # build:list returns an array; build:view returns a single object.
    # Normalize to single-object shape.
    BUILD_JSON="$(echo "$BUILD_JSON" | jq '.[0]')"
fi

ARTIFACT_URL="$(echo "$BUILD_JSON" | jq -r '.artifacts.buildUrl // .artifacts.applicationArchiveUrl // empty')"
BUILD_ID_RESOLVED="$(echo "$BUILD_JSON" | jq -r '.id // empty')"
RUNTIME_VERSION="$(echo "$BUILD_JSON" | jq -r '.runtimeVersion // .appVersion // "unknown"')"

if [[ -z "$ARTIFACT_URL" || "$ARTIFACT_URL" == "null" ]]; then
    echo "✖ Could not resolve an APK URL from that build. Output was:"
    echo "$BUILD_JSON" | jq .
    exit 1
fi

echo "  build id:        $BUILD_ID_RESOLVED"
echo "  runtime version: $RUNTIME_VERSION"
echo "  artifact:        $ARTIFACT_URL"

# ─── 2. Download the APK ───────────────────────────────────────────────
cd "$(git rev-parse --show-toplevel)"
echo "→ Downloading APK to ./piqabu.apk…"
curl -fL --progress-bar -o piqabu.apk "$ARTIFACT_URL"
APK_BYTES="$(wc -c < piqabu.apk)"
echo "  ✓ $(printf '%.1f' "$(echo "$APK_BYTES / 1024 / 1024" | bc -l)") MiB"

# ─── 3. Tag + push ─────────────────────────────────────────────────────
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "  ℹ Tag $TAG already exists locally — skipping create."
else
    echo "→ Tagging $TAG at HEAD…"
    git tag -a "$TAG" -m "$TAG"
fi
echo "→ Pushing tag to origin…"
git push origin "$TAG"

# ─── 4. Create the release ─────────────────────────────────────────────
echo "→ Creating GitHub release $TAG with piqabu.apk attached…"
gh release create "$TAG" piqabu.apk \
    --title "$TAG" \
    --notes "$NOTES" \
    --latest

# ─── 5. Clean up ───────────────────────────────────────────────────────
rm -f piqabu.apk
echo "  ✓ Local APK removed."

echo ""
echo "✔ Released $TAG."
echo "  Stable download URL (unchanging across releases):"
echo "    https://github.com/krasumashi/piqabu/releases/latest/download/piqabu.apk"
echo ""
echo "  Next: open Mission Control → Levers → Push update notice."
echo "  The APK URL field is pre-filled with the stable URL above."
