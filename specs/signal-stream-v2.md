# Signal Stream v2 — Product and Interaction Spec

Status: **implemented locally / pending device validation and release**. This
replaces the current split room in the working branch. Git history remains the
rollback surface until the new stream passes Android and iOS validation.

## Product statement

Piqabu is not a chat archive with disappearing-message decoration. It is a
live, consequential conversation surface designed to leave as little
retrospective material as practical.

Signal Stream v2 combines a continuous, scrollable correspondent surface with
a floating live composer. There is no Send button: typing, correction, and
deletion remain visible as they happen. The interaction logic may learn from
well-tested mobile composers, but the visual language, terminology, and
privacy behaviour remain Piqabu's own.

## Non-negotiable invariants

1. **No durable conversation history.** Stream content is session memory only.
   It is not written to AsyncStorage, a client database, analytics, crash
   breadcrumbs, or a server-side transcript.
2. **No Send action for text.** The correspondent sees the current text
   revision while it is being composed, including corrections and deletion.
3. **Vanish governs text.** A configured Vanish duration expires text blocks
   after the selected interval. An explicit clear action destroys the entire
   transient text stream for both participants.
4. **Show/Cover governs objects.** Images, videos, and documents do not inherit
   the text timer. The sender deliberately Shows an object and deliberately
   Covers it. Cover closes the receiver surface and triggers deletion of the
   temporary server copy when no longer needed.
5. **Selection is not disclosure.** Picking media stages it locally in the
   composer. Uploading and remote notification begin only when the sender
   chooses Show.
6. **No forced scroll.** Live updates follow automatically only while the
   receiver is at the bottom. When the receiver has scrolled upward, a compact
   `LIVE ↓` control indicates unseen activity without moving the page.
7. **Honest protection language.** Do not claim end-to-end encryption,
   screenshot prevention, anonymity, or metadata invisibility unless that
   property has been implemented and verified on the relevant platform.

## Primary room anatomy

### Session rail

A compact top rail contains room/presence state, Ghost Sync, Vanish state, and
an overflow menu. It should not compete visually with the live exchange.

### Signal Stream

The central surface is a virtualized vertical stream. It may contain:

- one mutable correspondent text block;
- earlier, still-live text blocks awaiting Vanish;
- sealed object notices;
- shown image, video, or document surfaces;
- compact Whisper, Live Glass, and Live Mirror invitations/status;
- minimal system events such as linked, covered, vanished, or interrupted.

The stream is not a conventional message history. Blocks exist only so text
can continue beneath an object and so the receiver can read at their own pace
before Vanish expires them.

### Live composer

The composer floats above the lower safe area and keyboard. Stream content can
move visually behind it, but bottom content padding must always allow the last
line to scroll fully above it.

The composer contains:

- a `+` action control;
- the growing live text field;
- a small live/transmission state rather than a Send arrow;
- a clear/vanish affordance;
- a horizontal attachment rail when objects are staged.

Each staged object exposes `SHOW` and `REMOVE`. A shown object exposes `COVER`.
Multiple staged objects retain independent state and progress.

### Action sheet

The `+` sheet is grouped to prevent it becoming an unstructured tool drawer:

- **Object:** Camera, Photos/Video, File/PDF.
- **Live:** Whisper, Live Glass, Live Mirror.
- **Privacy:** Vanish duration and clear stream.

Settings, device linking, and operator functions remain outside this sheet.

## Text lifecycle

Text is represented as ordered, transient revisions rather than messages.

1. First input creates the current live block.
2. Each edit updates that block on both devices.
3. Showing an object or starting a live mode closes the current block and
   inserts the new stream object.
4. Further typing creates a new live block below it.
5. Vanish countdown begins from the block's most recent revision or closing
   boundary; the final rule must be identical on both devices.
6. Expiry dissolves the block locally on both devices and removes it from
   memory. The server must not replay it after reconnect.

An idle pause may create a visual paragraph break, but it must not create a
durable sent message. Reconnection starts with a blank stream unless a future
protocol explicitly establishes a short-lived, end-to-end recovery mechanism.

### Timer behaviour

- Timer off: text remains only for the active room session or until explicitly
  cleared.
- Timer on: each closed/current text block expires after the selected duration.
- Editing a current block refreshes only that block's countdown.
- A shown object is unaffected by the text timer and remains controlled by
  Show/Cover.
- Invitations and system notices use short fixed lifetimes and cannot keep
  expired text alive.

## Object lifecycle

| State | Location and behaviour |
| --- | --- |
| Staged | Sender device memory only; removable without network disclosure. |
| Preparing | Sender has pressed Show; temporary upload/progress begins. |
| Sealed | Receiver sees a thin object marker without the contents. |
| Shown | Receiver may open the object inline or full-screen. |
| Covered | Receiver closes immediately; temporary access is revoked. |
| Expired | Temporary server copy is deleted and neither client retains it. |
| Failed | Sender sees retry/remove; receiver is not shown a broken object. |

The sender action is **Show**. The receiver experience may use **Peek** as a
verb, but the separate Reveal and Peek decks retire once inline object parity
is complete.

Videos and PDFs mount only when opened. Stream rows use lightweight posters,
metadata, or sealed placeholders to protect memory and avoid iOS native-view
failures.

## Anti-surveillance design posture

Piqabu optimizes against retrospective capture and habitual archiving:

- no server transcript;
- no client transcript cache;
- no content analytics;
- no media upload before explicit Show;
- short-lived room membership and upload lifecycle;
- neutral notification previews for sensitive events;
- app-switcher privacy cover;
- immediate session clear and predictable expiry;
- minimal operational metadata with documented retention.

This posture does not defeat a compromised endpoint, a second camera,
operating-system capture outside Piqabu's control, traffic analysis, or a
malicious correspondent recording what they see. Product copy should explain
these boundaries plainly. The current Signal Tower can observe relayed
plaintext events and temporary uploads; the product must not present that path
as end-to-end encrypted until a separately reviewed cryptographic protocol is
implemented.

Before launch, write a threat model covering the curious correspondent,
stolen/unlocked phone, network observer, compromised Signal Tower, malicious
operator, screenshots/screen recording, crash telemetry, and notification
leakage.

## Piqabu archival material language

The desired feeling is **an archive that refuses to become an archive**:
evidence-like, tactile, restrained, and impermanent.

Use:

- near-black paper rather than pure digital black;
- warm bone-white ink;
- restrained paper grain, scanner noise, halftone, and registration marks;
- redaction bars, case marks, stamps, timestamps, and specimen labels only
  where they communicate state;
- mono typography for metadata paired with a highly readable text face for
  conversation;
- dissolve, dust, abrasion, and signal-loss motion for Vanish;
- crisp, custom-consistent icons rather than emoji or novelty glyphs.

Do not use texture beneath small conversation text, let noise reduce contrast,
or imply that vanished content has been filed somewhere. The influence is a
material mood, not another product's interface, assets, name, or trade dress.

## iOS responsiveness requirements

The current room derives major sizes from screen height, and the custom
keyboard requests a fixed 332-point height. Both require explicit iOS work.

### Containing app

- Use both available width and height, safe-area insets, measured composer
  height, and current keyboard frame.
- Remove height-percentage trays from the final stream architecture.
- Constrain readable text measure on large phones without making the room look
  like a stretched tablet panel.
- Avoid double-applying the iOS keyboard safe area.
- Preserve the receiver's scroll position when the keyboard changes frame,
  predictive text appears, or another keyboard is selected.
- Verify portrait and landscape rather than treating portrait as the only
  valid geometry.

### Keyboard extension

- Replace the unconditional 332-point keyboard height with an adaptive,
  system-informed portrait/landscape layout.
- Keep Apple's required next-keyboard affordance and support
  `needsInputModeSwitchKey` correctly.
- Prefer SF Symbols or vector assets for Shift, Delete, Globe, and Return;
  avoid emoji glyphs whose rendering varies by iOS version.
- Compact the Mint/status guidance so it does not make ordinary typing rows
  feel compressed or vertically oversized.
- Size key caps from available width, preserve ergonomic row offsets, and
  validate touch targets and VoiceOver labels.
- Keep the extension offline and without Full Access, networking, pasteboard,
  or a shared container unless a later privacy decision explicitly changes
  that boundary.

### Required device matrix

- iPhone SE-size compact display;
- iPhone 12 Pro Max (reported stretch target);
- a current standard iPhone;
- a current large/Dynamic Island iPhone;
- portrait and landscape where the app permits them;
- default and increased text size;
- Apple keyboard, Piqabu keyboard, emoji keyboard, and keyboard switching.

The app shell can be previewed through a compatible Expo OTA. Any keyboard
extension adjustment requires a new signed native build and TestFlight pass.

## Implementation sequence

1. Capture before-state screenshots/video on Android and iPhone 12 Pro Max.
2. Correct iOS room geometry and keyboard-frame behaviour without changing the
   stream protocol.
3. Build the new Signal Stream shell in the room entry point while retaining
   the legacy components and Git history as the rollback path.
4. Add the in-memory transient block reducer and deterministic Vanish rules.
5. Move object staging into the composer and delay upload until Show.
6. Add sealed and inline object rows; verify Cover and server deletion.
7. Move Whisper/Glass/Mirror entry and invitation states into the stream.
8. Apply the archival material system after interaction and accessibility are
   stable.
9. Rebuild the native iOS keyboard adaptively and create a signed TestFlight
   binary.
10. Cross-device adversarial QA, preview release, then deliberate production
    rollout. Keep the legacy room implementation available for a Git rollback
    until parity is confirmed.

## Acceptance gates

- Android's currently working room and keyboard behaviour do not regress.
- iPhone 12 Pro Max no longer appears vertically or horizontally stretched.
- The iOS keyboard feels proportionate in portrait and landscape and retains
  normal typing, MINT/RESET, decoy, and keyboard switching.
- Scrolling upward never loses the reader's position during incoming typing.
- Vanish removes text from UI and memory on both clients without replay.
- Selecting an object causes no upload; Show causes the first network transfer.
- Cover closes the receiver object promptly and temporary deletion is verified.
- Long sessions with mixed text/video/PDF stay within the agreed memory budget.
- Accessibility labels, touch targets, contrast, reduced motion, and Dynamic
  Type have been checked.
- Security copy matches the tested technical guarantees.

## Evidence still required

Before release, capture screenshots or a short screen recording of the updated
Piqabu room and Piqabu keyboard on the iPhone 12 Pro Max, with the keyboard both
hidden and visible. The web viewport check can catch overflow, but only the
physical device can validate the native safe area and keyboard extension.

## Implementation note — 2026-07-22

The first implementation lives in `client/components/SignalStream.tsx` and is
wired from `client/app/room/index.tsx`. `useRoom.ts` maintains the session-only
remote stream and accepts backward-compatible item IDs and text-TTL metadata.
The Signal Tower relays that optional metadata and scoped Vanish events.

Object selection is local. Show performs the first upload, flushes the exact
current text revision, inserts the object boundary, and clears the composer.
The shown-video card and staged/shown video tile both retain an explicit play
icon. Cover removes the receiver's inline object and asks the Signal Tower to
unlink the room-owned temporary upload immediately; the upload purge path has
an integration smoke test. Physical Android and iOS validation, server
deployment, OTA publication, and the signed iOS keyboard build remain
deliberately incomplete.
