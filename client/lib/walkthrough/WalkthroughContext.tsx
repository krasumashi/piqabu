/**
 * Walkthrough context — registers UI elements that the
 * WalkthroughOverlay can highlight by name.
 *
 * Pattern:
 *   1. Whatever screen wants to participate wraps its content in
 *      <WalkthroughProvider>. We mount this near the app root.
 *   2. Each component that wants to be a walkthrough target calls
 *      useWalkthroughTarget('uniqueName') and attaches the returned
 *      ref to its outermost View.
 *   3. WalkthroughOverlay reads currentStep from context, asks
 *      measureTarget for the registered name, and draws its
 *      cutout + typewriter card around that rect.
 *
 * Steps are defined here so the overlay can advance through them
 * without each consumer needing to know the order. Easy to extend
 * later — append to the WALKTHROUGH_STEPS array, register the new
 * target ref in the target component, done.
 */
import React, {
    createContext, useCallback, useContext, useEffect, useMemo,
    useRef, useState,
} from 'react';
import { View } from 'react-native';
import { getSecureItem, setSecureItem } from '../platform/storage';

export interface WalkthroughStep {
    /** Target name registered via useWalkthroughTarget. */
    target: string;
    title: string;
    body: string;
    /** Where to place the card relative to the target. Defaults to
     *  'auto' which picks above/below based on which has more room. */
    placement?: 'above' | 'below' | 'auto';
}

/**
 * The room-screen walkthrough sequence. Order matters — each step
 * builds on the last. Keep bodies short — the typewriter cap is
 * around ~120 characters before it feels long.
 */
export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
    {
        target: 'statusPill',
        title: 'CHANNEL STATUS',
        body: 'PARTNER ACTIVE when both of you are connected. WAITING until your correspondent arrives.',
    },
    {
        target: 'peep',
        title: 'PEEP',
        body: 'Send images that vanish when you both close them. Nothing lives on our servers.',
    },
    {
        target: 'whisper',
        title: 'WHISPER',
        body: 'Push-to-talk voice. Peer-to-peer — your audio never touches our infrastructure.',
    },
    {
        target: 'reveal',
        title: 'REVEAL',
        body: 'Send files and documents. Your correspondent sees a temporary preview, then they\'re gone.',
    },
];

const COMPLETED_KEY = 'piqabu_walkthrough_v1_completed';

export interface TargetRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface WalkthroughContextValue {
    /** True when overlay should be visible. */
    active: boolean;
    /** 0-indexed pointer into WALKTHROUGH_STEPS. */
    stepIndex: number;
    /** Current step, or null when inactive. */
    currentStep: WalkthroughStep | null;
    /** Begin a walkthrough run from step 0. */
    start: () => void;
    /** Advance to the next step. If at the last step, completes. */
    next: () => void;
    /** Abandon the walkthrough without marking complete. User can
     *  retrigger via Settings. */
    skip: () => void;
    /** Register a target view for measurement. */
    registerRef: (name: string, ref: React.RefObject<View | null>) => void;
    /** Measure a target. Returns null if not registered or not yet
     *  laid out. */
    measureTarget: (name: string) => Promise<TargetRect | null>;
}

const Ctx = createContext<WalkthroughContextValue | null>(null);

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
    const [active, setActive] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const refs = useRef<Map<string, React.RefObject<View | null>>>(new Map());

    const registerRef = useCallback((name: string, ref: React.RefObject<View | null>) => {
        refs.current.set(name, ref);
    }, []);

    const measureTarget = useCallback((name: string): Promise<TargetRect | null> => {
        return new Promise((resolve) => {
            const ref = refs.current.get(name);
            const node = ref?.current;
            if (!node || typeof (node as any).measureInWindow !== 'function') {
                resolve(null);
                return;
            }
            // measureInWindow can fire its callback with NaN early in
            // a paint cycle. Guard + retry once.
            (node as any).measureInWindow((x: number, y: number, width: number, height: number) => {
                if (Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0) {
                    resolve({ x, y, width, height });
                } else {
                    setTimeout(() => {
                        const node2 = ref.current as any;
                        if (!node2?.measureInWindow) { resolve(null); return; }
                        node2.measureInWindow((x: number, y: number, w: number, h: number) => {
                            if (Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0) {
                                resolve({ x, y, width: w, height: h });
                            } else {
                                resolve(null);
                            }
                        });
                    }, 100);
                }
            });
        });
    }, []);

    const start = useCallback(() => {
        setStepIndex(0);
        setActive(true);
    }, []);

    const next = useCallback(() => {
        setStepIndex((i) => {
            if (i + 1 >= WALKTHROUGH_STEPS.length) {
                setActive(false);
                void setSecureItem(COMPLETED_KEY, '1').catch(() => {});
                return 0;
            }
            return i + 1;
        });
    }, []);

    const skip = useCallback(() => {
        setActive(false);
        setStepIndex(0);
    }, []);

    const currentStep = active ? WALKTHROUGH_STEPS[stepIndex] ?? null : null;

    const value = useMemo<WalkthroughContextValue>(() => ({
        active, stepIndex, currentStep, start, next, skip, registerRef, measureTarget,
    }), [active, stepIndex, currentStep, start, next, skip, registerRef, measureTarget]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWalkthrough(): WalkthroughContextValue {
    const ctx = useContext(Ctx);
    if (!ctx) {
        // Safe fallback so consumers don't crash if Provider isn't
        // mounted (e.g. in tests or screens outside the room flow).
        return {
            active: false, stepIndex: 0, currentStep: null,
            start: () => {}, next: () => {}, skip: () => {},
            registerRef: () => {},
            measureTarget: async () => null,
        };
    }
    return ctx;
}

/**
 * Attach the returned ref to the View you want the walkthrough to
 * highlight. The component re-registers on each mount so position
 * changes (rotation, re-layout) are picked up.
 */
export function useWalkthroughTarget<T extends View = View>(name: string) {
    const { registerRef } = useWalkthrough();
    const ref = useRef<T | null>(null);
    useEffect(() => {
        registerRef(name, ref as React.RefObject<View | null>);
    }, [name, registerRef]);
    return ref;
}

/**
 * Has this device finished the walkthrough at least once?
 * Used by the room screen to decide whether to auto-trigger on
 * first entry. Settings panel's "Replay Walkthrough" wipes this
 * flag.
 */
export async function isWalkthroughCompleted(): Promise<boolean> {
    try {
        const v = await getSecureItem(COMPLETED_KEY);
        return v === '1';
    } catch { return false; }
}

export async function resetWalkthrough(): Promise<void> {
    try { await setSecureItem(COMPLETED_KEY, ''); } catch { /* noop */ }
}
