# Piqabu iOS via TestFlight (paid Apple Developer account)

This is the primary iOS distribution now that the Apple Developer account
is approved. **Not** a public App Store listing — TestFlight is Apple's
beta channel: up to 10,000 external testers, 90-day builds, one-tap
install via a link, and OTA JS updates keep working. It replaces the
SideStore path (no more 7-day re-signing).

- Bundle identifier: `com.krasumashi.piqabu`
- Apple Team ID: `C78383ZQUS` (already in app.json + eas.json)
- OTA channel: `preview` (the TestFlight build receives the same
  `eas update --branch preview` updates as everything else)

---

## 1. Build a signed iOS app (cloud, no Mac)

```bash
cd client
eas build --platform ios --profile testflight
```

- First run sets up **credentials**: it logs into your Apple account,
  and — when asked — **let EAS manage the distribution certificate +
  provisioning profile** (recommended; it creates and stores them in your
  Expo account). It also creates the App Store Connect app record for the
  bundle id if it doesn't exist.
- `autoIncrement` bumps the build number automatically (TestFlight
  requires a unique build number per upload).

> If `eas build` crashes locally on Windows like before
> (`0xC0000142` at runtimeversion:resolve), don't fight it — trigger the
> build from the **Expo dashboard** instead (expo.dev → project → Builds →
> "Create build" → iOS → profile `testflight`), same as the Android
> GitHub-triggered builds. `eas update` / `eas submit` still run locally.

## 2. Upload to TestFlight

```bash
eas submit --platform ios --profile testflight --latest
```

First run sets up an **App Store Connect API key** (recommended) or asks
for your Apple ID — follow the prompts. It uploads the build to App Store
Connect, where it appears under **TestFlight** after Apple finishes
processing (a few minutes).

## 3. Turn on external testing

In **App Store Connect → your app → TestFlight**:

1. Add a **Test Information** blurb + a contact email (required once).
2. Create an **External** testing group → enable the **public link**
   (or invite testers by email).
3. Submit the build for **Beta App Review** — this is the *light* review
   (not full App Store review), usually cleared within a day.

Once approved, anyone with the link installs the **TestFlight** app from
the App Store, taps your link, and installs Piqabu.

## 4. Send the link

Share the TestFlight public link (or email invite). Testers install +
open — no computer, no weekly refresh.

---

## Updating later

- **JS-only changes** (most work): `eas update --branch preview --platform all`
  — reaches the TestFlight build on next launch, no rebuild.
- **Native changes** (new module, permission, icon, version bump): rebuild
  (`eas build --platform ios --profile testflight`) + `eas submit` again.
  A new TestFlight build may need another quick Beta App Review.

## Notes

- **Donations are Apple-compliant.** Piqabu is free and donations unlock
  nothing, so Apple IAP is not required — genuine donations via Paystack
  are allowed. (Only gating features behind payment would trigger IAP
  rules.)
- **No iOS keyboard.** Same as before — iPhone users use the normal
  keyboard + generate/share a link; the keyboard is Android-only.
- **SideStore is now retired** as the primary path. The
  `.github/workflows/ios-sidestore.yml` workflow + `README-ios-sidestore.md`
  can stay as an optional "no-gatekeeper" fallback, but nobody needs to
  rely on it once TestFlight is live.
