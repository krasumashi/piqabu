# Deepfake Detection — Architecture Spec

Status: **spec / not yet built**. Ships on a feature branch.

## Why this matters for Piqabu

The product promise is *private, ephemeral conversation* — and the people who reach for Piqabu in a high-trust moment (a financial decision, an emotional confidence, a sensitive negotiation) are exactly the people a synthetic-impostor attack hurts most. Voice-cloning a relative for "send me money now," face-swap-on-a-live-video to impersonate a partner in a Live Glass call, AI-generated "proof of life" photos in the Vault — these aren't speculative threats anymore, they're a thing happening on WhatsApp and Telegram today.

Piqabu can't promise to be a deepfake-proof channel. No app can. But we can make synthesis visible to the user when our models can see it, and we can do it without breaking the privacy posture that makes Piqabu Piqabu. This spec sketches how.

## Threat model — what we actually defend against

Three high-value surfaces, ranked by stakes:

| Surface | Attack | Phase |
|---|---|---|
| **Live Glass** (live video) | Real-time face-swap or fully synthetic video pretending to be a known contact | Phase 2 |
| **Whisper PTT** (live audio) | Voice clone speaking on behalf of a known contact | Phase 3 |
| **Reveal Vault** (still images) | Generated photo presented as "proof" (selfie, doc, location) | Phase 1 |

Explicitly **out of scope**:

- Document forgery (it's a different problem — PDF tampering, not synthesis. The Doc Signing flow already has its own integrity story.)
- Server-side detection of any kind. Piqabu's posture is on-device-or-nothing. Sending media to a remote model would break the ephemerality contract harder than the value the detection adds.
- Strong claims like "this is fake" or "this is real". We surface a probability with calibrated language. False positives are common enough that absolute claims would be more damaging than the attack we're defending against.

## Design principles

1. **On-device only.** Models run on the user's phone. No frames, no audio, no embeddings leave the device. This is the constraint that makes Piqabu Piqabu and the constraint that bounds every other choice.

2. **Probability, not verdict.** UI shows a confidence indicator, not a binary "real / fake" label. Models in this space have ~85–95% accuracy on held-out test sets and far worse in the wild. Pretending to be a court reporter would be worse than helpful. Frame it as "signal," not "ruling."

3. **Passive by default, visible on demand.** A small static indicator in the corner of the relevant surface (the same monospace pulse-dot grammar the rest of the app uses). Tap to expand into the explanation. No giant modals interrupting a conversation. The whole point of being in Piqabu is to feel heard, not to be alarmed.

4. **No training data collection.** No "we trained on user content." The models we ship were trained on public datasets (FaceForensics++, ASVspoof2021, WildDeepfake). No on-device telemetry of detections. No analytics.

5. **Battery + thermal budget is fixed.** Real-time inference on a phone CPU/NPU during a video or audio call is expensive. The detector has to fit inside a strict envelope: < 8% additional battery per minute of active use; < 0.5°C added skin temp on a mid-range Pixel. If we can't hit that, the feature degrades to opt-in or runs at lower frame rate.

6. **Inert when not needed.** When no live media surface is active and no media has just arrived in the Vault, the model isn't loaded into memory. Cold-start on first frame is acceptable (~300–500 ms); the conversation tolerates that gracefully.

## The three phases

### Phase 1 — still images in Reveal Vault (lowest risk, ship first)

**Trigger:** every image that arrives in Reveal Vault, after receipt, before user views it.

**Model:** `EfficientNet-B0` fine-tuned on a 4-way classifier (real / GAN-generated / diffusion-generated / manipulated). Quantized to int8, 4–8 MB on-disk in TFLite. Inference ~100ms on a mid-range Snapdragon.

**Runtime:** `react-native-fast-tflite`. Frame is fed as a 224×224 RGB tensor. Output is a 4-vector of probabilities, collapsed into a single "synthesis confidence" score.

**UX:**
- Image displays normally with no decoration if confidence < 30%.
- Small pulse-dot in the corner of the image when 30–70% — tap to see "MODEL FLAGGED THIS IMAGE — DETAILS." Surface: short copy ("This image shows signs of being AI-generated. The detector isn't always right. Use judgment.") plus the confidence number.
- Same dot, brighter / amber, when > 70%.
- Never blur or block. The user always sees what was sent. Censoring the image would be worse than not detecting it at all — the user came here to communicate.

**Why this phase first:** lowest blast radius. Doesn't run continuously. No real-time pressure. Failure mode is "missed a detection," which is the same as before the feature existed. Easy to evaluate against any public dataset before shipping.

### Phase 2 — live video in Live Glass

**Trigger:** when Live Glass is active. Runs at 5 fps against the *incoming* peer video stream only (the local user's own face is not analyzed).

**Model:** `MobileFaceForensics` (a MobileNet-V3-Small backbone trained on FaceForensics++ and Celeb-DF v2). ~3 MB quantized. ~15ms per frame on a mid-range NPU.

**Frame integration:** uses `react-native-vision-camera`'s frame-processor plugin pattern, or hooks into the WebRTC track's `MediaStreamTrack` directly via a thin native module.

**Important:** the model needs to see faces. We piggy-back on the camera pipeline's existing face detector (already used for the Pulse heuristic). If no face is in frame, the detector is a no-op — saves the cycles.

**UX:**
- Continuous integrator across the last 5 seconds of frames (~25 samples). Smooths over single-frame jitter.
- A 1px-wide pulse strip on the edge of the remote video frame, colour-coded by confidence. Most of the time it's invisible (real conversation reads as "real"). Slowly intensifies if confidence rises.
- Tap-to-expand: shows the integrated score and a "RECORD INCIDENT" affordance — saves a 5-second clip locally (only locally), pre-encrypted, that the user can later show someone they trust outside Piqabu.

**Performance check:** if frame-level inference takes > 50ms on a mid-range device (i.e. drops the call's frame rate visibly), the model degrades to 2 fps and surfaces a "SLOW — DETECTION REDUCED" badge in the indicator.

### Phase 3 — live audio in Whisper

**Trigger:** when Whisper PTT is active, on the incoming peer audio.

**Model:** `RawNet2-Lite` or `AASIST-Lite`, both well-published on ASVspoof2021. ~5–8 MB quantized. Processes 1-second audio windows; output is a spoof-probability per window.

**Audio integration:** taps into the existing audio pipeline. Whisper's WebRTC track already runs through `Audio.Recording`; we add a passthrough that buffers a 1-second sliding window every 0.5 seconds.

**UX:**
- A small flicker on the Whisper indicator dot when the integrated score crosses threshold.
- Same affordances as Phase 2: tap-to-expand, "RECORD INCIDENT" saves the last 5 seconds of audio locally.

**Open question:** voice-clone detection accuracy in the wild is meaningfully worse than image/video detection accuracy (~70% F1 vs ~85%). We may end up shipping this with a much higher threshold or as opt-in only. To be decided after Phase 1+2 ship and we've seen the false-positive rate in practice.

## What stays out, even of later phases

- **Embeddings or "telemetry"** to a backend. Even aggregated. Even anonymized. Don't do it.
- **A "fakeness leaderboard"** or shareable score. Don't gamify this. The product is "feel heard fast," not "performative trust theatre."
- **Auto-block / auto-mute on high confidence.** Always leave the user in control of the conversation.
- **A "deepfake mode" toggle.** Either it's on for everyone or it's not a feature. A toggle implies the user can opt OUT of being warned, which is a UX trap — they'll never turn it on after disabling it once. The right answer is to make the indicator quiet enough that it never bothers anyone, not optional.

## Engineering shape

Single feature branch — `feat/deepfake-detection` — branched off main.

**Phase 1 PR shape (illustrative):**

```
client/
  lib/detection/
    EfficientNetClassifier.ts       — loads the .tflite, exposes infer()
    types.ts                        — SynthesisProbability shape
  models/efficientnet-b0-quant.tflite   — 4 MB, bundled
  components/
    RevealVault.tsx                 — hooks in postReceive
    SynthesisIndicator.tsx          — the corner pulse-dot
```

No server changes. No new permissions (camera + audio already declared). The .tflite file's hash should be `expo-asset`-pinned so a malicious OTA can't swap in a model that lies.

## Performance envelope (concrete numbers we will measure)

| Surface | Frame rate | Inference budget | Memory | Battery cost (per min active) |
|---|---|---|---|---|
| Phase 1 (Vault) | One-shot per image | < 300ms cold, < 100ms warm | < 30 MB peak | Negligible |
| Phase 2 (Glass) | 5 fps continuous | < 30ms per frame on NPU | < 60 MB resident | < 8% |
| Phase 3 (Whisper) | 2 windows/sec | < 50ms per window | < 40 MB resident | < 5% |

If we exceed those numbers on the median Android device (Snapdragon 7-series equivalent or Tensor G2/G3), the model swaps for a smaller variant before shipping. Hard rule.

## What we ship at v1 of the spec

Phase 1 only. The Vault check is the smallest, lowest-risk, highest-readability surface to prove the approach. It also doesn't require any frame-processor / native-bridge work — pure React Native side. If it ships and behaves, Phase 2 follows.

## Open questions to answer before Phase 1 PR

1. **Bundled model vs. downloaded.** Bundling the .tflite makes the APK ~5 MB larger. Downloading on first run means a network hit at the worst moment (a user trying out Piqabu for the first time). Recommend: **bundle**. Privacy-app users don't want surprise model downloads.

2. **Threshold defaults.** Need to run the model against a held-out portion of WildDeepfake and pick thresholds that give us roughly 1 false-positive per 100 real images on phones the user actually has. Picking thresholds is more important than picking models.

3. **Localization of the explanation copy.** Out of scope for v1. English only. Open in v2.

4. **Accessibility.** The pulse-dot needs an accessible alt text + non-colour-only signal. To do during Phase 1 implementation.

## Versions we revisit this spec

- After Phase 1 ships and we have observed the false-positive rate on real user-sent images for a month
- When a markedly better open-source detector publishes (model landscape moves fast — Adobe / Meta / academic labs are releasing checkpoints monthly)
- If Piqabu adds a new high-stakes media surface

Spec lives in `specs/deepfake-detection.md` and gets updated in place rather than versioned.
