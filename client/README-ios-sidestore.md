# Piqabu iOS via SideStore (no App Store, no paid Apple account)

This distributes the **main Piqabu app** to iPhone as a real native app,
signed on-device with a free Apple ID via **SideStore**. It is the native
counterpart to the Android app — camera, mic, WebRTC (Whisper / Live
Glass), Reveal/Peek, rooms, and the generate-and-share-a-link flow all
work with real hardware access.

## Scope (important)

- **No iOS keyboard.** iPhone users type with their normal keyboard, open
  the app, generate a code/link, and share it. The Piqabu keyboard is
  Android-only (iOS keyboard extensions can't integrate the way we need on
  a free-account sideload — App Groups are disabled there).
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

> First run may fail on an Xcode/pod/config detail — iOS issues only show
> up on macOS. Read the failing step's log and adjust; it usually takes a
> fix or two to go green.

Host the `.ipa` somewhere the phone can reach (e.g. drop it in a GitHub
Release, or AirDrop / send it to the device), or install straight from the
Files app.

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

- **JS-only changes** (most features/fixes): the app is wired for EAS
  Update OTA, so many changes reach the installed app without a rebuild.
- **Native changes** (new native module, permission, icon): re-run the
  GitHub Actions build to produce a new `.ipa`, then install it over the
  old one in SideStore.

---

## Why unsigned + SideStore (not EAS)

EAS Build can't sign iOS device builds without a **paid** Apple Developer
account (free-account "Personal Team" signing is an Xcode-only feature EAS
can't use). So we build the app **unsigned** and let SideStore apply the
free-account signature on-device. Same reason we can't build it on Windows:
the compile step itself requires macOS.
