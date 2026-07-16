# Piqabu iOS via SideStore (no App Store, no paid Apple account)

This distributes the **main Piqabu app** to iPhone as a real native app,
signed on-device with a free Apple ID via **SideStore**. It is the native
counterpart to the Android app — camera, mic, WebRTC (Whisper / Live
Glass), Reveal/Peek, rooms, and the generate-and-share-a-link flow all
work with real hardware access.

## Scope (important)

- **Keyboard extension is TestFlight-first.** The repository now contains
  an offline iOS keyboard target that requires no App Group or Full Access,
  but SideStore re-signing of the embedded extension has not been validated.
  Do not advertise keyboard support for the SideStore build until the IPA
  installs, exposes the keyboard in Settings, and passes an on-device test.
- **No Apple cloud features.** Push notifications, Sign in with Apple,
  In-App Purchases, and iCloud sync do **not** work on free-account
  sideloads. Piqabu doesn't need them (it's free/donation-supported and
  uses its own relay), so nothing is lost.
- **7-day refresh.** Free-signed apps expire after 7 days. SideStore
  re-signs them automatically as long as the user opens SideStore about
  once a week (see below).

---

## 1. Build the unsigned `.ipa` (in the cloud, no Mac)

The app binary can't be built on Windows — it needs macOS. We use GitHub's
free macOS runners to produce an **unsigned** `.ipa`; SideStore signs it
on-device at install.

1. Push this repo to GitHub (already done).
2. GitHub → **Actions** tab → **"iOS unsigned IPA (SideStore)"** →
   **Run workflow**.
   - Or push a tag: `git tag ios-v0.3.0 && git push origin ios-v0.3.0`.
3. When the run finishes (~15–25 min), open the run's summary page and
   download the **`Piqabu-ios-unsigned-ipa`** artifact. Inside is
   `Piqabu-unsigned.ipa`.

Every successful build also **auto-publishes** the `.ipa` to a fixed
GitHub prerelease tagged `ios-latest`, so there's a **stable download URL
that never changes**:

```
https://github.com/krasumashi/piqabu/releases/download/ios-latest/Piqabu.ipa
```

Hand that URL to the landing page (the "iPhone download" button) and to
testers. Each new build replaces the file behind the same link. (It's
marked *prerelease* so it never overrides the Android APK's "latest
release" download.)

### SideStore Source (recommended — one-tap install + auto-update)

Each build also publishes a **SideStore/AltStore source manifest** to the
same release. This is the nicer distribution: users add the source once,
then install *and auto-update* Piqabu from inside SideStore — no
re-downloading .ipa files. Stable source URL:

```
https://github.com/krasumashi/piqabu/releases/download/ios-latest/apps.json
```

- **Add-to-SideStore deep link** for a landing-page button:
  `sidestore://source?url=https://github.com/krasumashi/piqabu/releases/download/ios-latest/apps.json`
- Version + file size in the manifest are regenerated on every build
  (`scripts/gen-sidestore-source.js`) so SideStore detects updates
  correctly.
- Want a branded URL? Add a redirect on the landing site from
  `piqabu.live/apps.json` → the release-asset URL above, and hand the
  landing page `piqabu.live/apps.json` instead.

> The repo must be **public** for the release-asset + raw-icon URLs to be
> reachable without auth.

---

## 2. Install SideStore on the iPhone (one-time)

SideStore's own initial install currently needs a computer **once** to
pair the device; after that, refreshes happen on-device with no computer.
SideStore's exact steps change over time — follow the official guide:

- Official install guide: <https://sidestore.io> → **Install**.

The gist:
1. On a Windows/Mac/Linux computer, use SideStore's installer to pair the
   iPhone and install the **SideStore** app onto it.
2. On the iPhone, open SideStore and sign in with a **free Apple ID**
   (use a throwaway Apple ID, not the main one — it gets an app-specific
   sign-in). This Apple ID is what signs the apps.
3. SideStore sets up an on-device refresh mechanism (a local WireGuard
   profile) so it can re-sign apps weekly without the computer.

Free Apple ID limits to be aware of: **max 3 sideloaded apps at once** and
the **7-day** signing window.

---

## 3. Install Piqabu into SideStore

1. On the iPhone, open the `Piqabu-unsigned.ipa` (from Files, or a link) —
   or in SideStore tap **+** and choose the `.ipa`.
2. SideStore signs it with the Apple ID and installs it. First launch will
   show the normal iOS permission prompts (camera / mic / photos) — allow
   them as needed.
3. Trust the developer if prompted: **Settings → General → VPN & Device
   Management → [your Apple ID] → Trust**.

---

## 4. Keeping it alive (the weekly refresh)

- Free-signed apps stop opening after **7 days** unless re-signed.
- **Open SideStore about once a week** and let it **Refresh** Piqabu (it
  can also auto-refresh in the background via its VPN profile). As long as
  that happens within the 7-day window, the app keeps working.
- If it does lapse, just refresh/reinstall from SideStore — data in the
  app follows the normal reinstall behavior.

Put a short note on the website (as planned): *"iPhone users: install via
SideStore — open SideStore once a week to keep Piqabu active."*

---

## Updating the app later

The iOS build is wired to the **`preview` OTA channel** (the workflow sets
`expo-channel-name: preview` in Expo.plist), same as Android.

- **JS-only changes** (most features/fixes): publish with
  `eas update --branch preview --platform android,ios` — the change reaches
  the installed iOS app on next launch, **no rebuild**. (Include `ios`;
  older commands used `--platform android` only.)
- **Native changes** (new native module, permission, icon, version bump):
  re-run the GitHub Actions build for a new `.ipa`, then update it in
  SideStore.

Runtime version is fixed at `1.0.0`, so OTA updates apply as long as that
doesn't change.

---

## Why unsigned + SideStore (not EAS)

EAS Build can't sign iOS device builds without a **paid** Apple Developer
account (free-account "Personal Team" signing is an Xcode-only feature EAS
can't use). So we build the app **unsigned** and let SideStore apply the
free-account signature on-device. Same reason we can't build it on Windows:
the compile step itself requires macOS.
