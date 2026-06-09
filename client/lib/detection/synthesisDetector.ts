/**
 * Synthesis detector — abstraction over the deepfake-detection model.
 *
 * Phase 1 of the deepfake-detection spec (`specs/deepfake-detection.md`).
 * Runs on received still images in PeepDeck (the Reveal Vault). Returns
 * a probability score the caller surfaces via SynthesisIndicator.
 *
 * ## Engine layers
 *
 * Two implementations, swappable by changing `currentEngine`:
 *
 *   1. **StubEngine (default)** — Returns deterministic-but-meaningless
 *      values, derived from a hash of the image URI so the same image
 *      always returns the same score. Lets us ship the entire UI
 *      pipeline + integration WITHOUT a real model. Visually labelled
 *      as "MODEL NOT LOADED" so the user knows they're not seeing real
 *      analysis. Replacing this with a real TFLite engine is a single
 *      `currentEngine = realEngine` assignment.
 *
 *   2. **TFLiteEngine (planned)** — react-native-fast-tflite + a
 *      EfficientNet-B0 trained on FaceForensics++ / WildDeepfake,
 *      quantized to int8 (~4-8 MB on disk). To enable:
 *        a. Source / fine-tune the model.
 *        b. `npx expo install react-native-fast-tflite`
 *        c. Drop the .tflite under `assets/models/synthesis-v1.tflite`.
 *        d. Implement TFLiteEngine.classify() and flip currentEngine.
 *      The interface this file defines (`SynthesisEngine.classify()`)
 *      is intentionally minimal so swap-in is trivial.
 *
 * ## What "score" means
 *
 *   - 0.00 → 1.00 probability the image is synthetic.
 *   - We DON'T binarize. UI surfaces the probability as a tint /
 *     pulse-dot intensity, never as "FAKE" or "REAL."
 *   - Below ~0.30: no indicator at all. Most real images.
 *   - 0.30–0.70: subtle indicator, "MODEL FLAGGED."
 *   - Above 0.70: brighter indicator, copy still says "may be
 *     synthetic" — never an absolute claim.
 *
 * Threshold defaults are conservative. They'll be tuned against
 * WildDeepfake's held-out set before the real model ships.
 *
 * ## Performance budget (per spec)
 *
 *   - <300ms cold inference, <100ms warm.
 *   - <30 MB peak memory.
 *   - One-shot per image (no continuous frame processing in Phase 1).
 *
 * ## Privacy
 *
 *   - Inference runs on-device. No image bytes leave the phone.
 *   - No model updates over the wire — bundled with the APK; if we
 *     ever rev the model it ships via an EAS build.
 *   - No detection telemetry — the score lives only in the UI
 *     component's local state, never persisted, never logged.
 */

export interface SynthesisProbability {
    /** 0.00–1.00, where 1.00 means highly likely synthetic. */
    score: number;
    /** False when the engine couldn't analyse (e.g. unsupported
     *  image, model load failed). */
    valid: boolean;
    /** Engine identifier — surfaces in the UI footer so we always know
     *  whether the user saw real analysis or the stub. */
    engineId: string;
    /** Optional one-line reason when valid=false. */
    reason?: string;
}

export interface SynthesisEngine {
    readonly id: string;
    classify(imageUri: string): Promise<SynthesisProbability>;
}

/**
 * Stub engine. Returns a deterministic score derived from a non-
 * cryptographic hash of the image URI. Two properties:
 *
 *   1. Same image always yields the same score — UX tests are
 *      reproducible while we develop the indicator component.
 *   2. The score distribution is spread across the threshold bands so
 *      visual testing exercises each indicator tier (no-show, faint,
 *      bright) without manual seeding.
 *
 * Marked invalid=false because the score is meaningless. UI surfaces
 * a "DETECTOR NOT YET TRAINED" line below the indicator when the
 * engine id is "stub-v0" so a returning Pro user understands what
 * they're looking at.
 */
class StubEngine implements SynthesisEngine {
    readonly id = 'stub-v0';
    async classify(imageUri: string): Promise<SynthesisProbability> {
        // Tiny non-cryptographic hash for visual reproducibility.
        let h = 2166136261;
        for (let i = 0; i < imageUri.length; i++) {
            h ^= imageUri.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        // Normalize to [0, 1).
        const score = ((h >>> 0) % 1000) / 1000;
        return {
            score,
            // Honest signal — this is not a real verdict.
            valid: false,
            engineId: this.id,
            reason: 'Detector not yet trained. Showing placeholder.',
        };
    }
}

let currentEngine: SynthesisEngine = new StubEngine();

/**
 * Swap in a different engine. Reserved for when the real TFLite engine
 * lands. Calling more than once is fine — the most recent engine wins.
 */
export function setSynthesisEngine(engine: SynthesisEngine): void {
    currentEngine = engine;
}

export function getSynthesisEngine(): SynthesisEngine {
    return currentEngine;
}

/**
 * Convenience entry point — most callers should use this rather than
 * grabbing the engine themselves.
 */
export async function classifyImage(imageUri: string): Promise<SynthesisProbability> {
    if (!imageUri) {
        return { score: 0, valid: false, engineId: currentEngine.id, reason: 'No image to classify.' };
    }
    return currentEngine.classify(imageUri);
}

/**
 * Threshold bands. Centralized so SynthesisIndicator and any future
 * Settings screen agree on what "flagged" vs "highly likely" means.
 */
export const SYNTHESIS_THRESHOLDS = {
    /** Below this, render nothing. Most real images.   */
    SILENT: 0.30,
    /** Between SILENT and SUSPICIOUS: faint indicator. */
    SUSPICIOUS: 0.70,
    /** Above SUSPICIOUS: brighter indicator.           */
};

export type SynthesisBand = 'silent' | 'flagged' | 'suspicious';

export function classifyBand(score: number): SynthesisBand {
    if (score < SYNTHESIS_THRESHOLDS.SILENT) return 'silent';
    if (score < SYNTHESIS_THRESHOLDS.SUSPICIOUS) return 'flagged';
    return 'suspicious';
}
