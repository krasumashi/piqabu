# Piqabu iOS keyboard target

This is a native Swift custom-keyboard extension generated into the iOS project by `@bacons/apple-targets` during Expo prebuild.

## Privacy and App Review constraints

- `RequestsOpenAccess` is deliberately `false`.
- The extension has no network or App Group entitlement.
- MINT generates a six-character code locally and inserts `https://piqabu.live/j/<code>` through `textDocumentProxy`.
- The extension never logs or stores keystrokes and never reads the pasteboard.
- The globe button remains dedicated to Apple's keyboard switcher.
- The extension does not launch Piqabu. The user sends the minted link and taps it to enter the app.
- The decoy feature uses a dedicated key rather than repurposing Return.

Do not add networking, shared storage, payment, marketing, app-launch tricks, or Full Access without a new privacy and App Review decision.

## Identity

- target: `PiqabuKeyboard`;
- bundle identifier: `com.krasumashi.piqabu.keyboard`;
- containing app: `com.krasumashi.piqabu`;
- minimum iOS version: 15.1.

## Build and test

This is a native change and cannot ship through Expo OTA. Generate and build on macOS/EAS:

```bash
npx expo prebuild -p ios --clean
eas build --platform ios --profile testflight
```

On a device, enable it through **Settings → General → Keyboard → Keyboards → Add New Keyboard → Piqabu**. Full Access should remain off.

Before submission, test ordinary text fields, Messages, WhatsApp, the globe switcher, MINT/RESET, sender and receiver universal links, symbols, Shift, Delete, Return, and the decoy key. Confirm iOS replaces the keyboard in secure/phone-pad fields as expected.
