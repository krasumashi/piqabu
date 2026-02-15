/**
 * Voice filter processing using Web Audio API.
 * Filters: ghost (pitch down + reverb), lowkey (band-pass), robot (ring modulator).
 * Only works on web platform — native falls back to raw audio.
 */

import { Platform } from 'react-native';

export type VoiceFilterType = 'true' | 'ghost' | 'lowkey' | 'robot';

/**
 * Apply a voice filter to a base64 audio data URI.
 * Returns a new base64 data URI with the processed audio.
 */
export async function applyVoiceFilter(
    dataUri: string,
    filter: VoiceFilterType
): Promise<string> {
    if (Platform.OS !== 'web' || filter === 'true') {
        return dataUri;
    }

    try {
        // Decode base64 to ArrayBuffer
        const response = await fetch(dataUri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        let processedBuffer: AudioBuffer;

        switch (filter) {
            case 'ghost':
                processedBuffer = await applyGhostFilter(audioContext, audioBuffer);
                break;
            case 'lowkey':
                processedBuffer = await applyLowKeyFilter(audioContext, audioBuffer);
                break;
            case 'robot':
                processedBuffer = await applyRobotFilter(audioContext, audioBuffer);
                break;
            default:
                processedBuffer = audioBuffer;
        }

        // Encode back to data URI
        const resultUri = await audioBufferToDataUri(processedBuffer);
        await audioContext.close();
        return resultUri;
    } catch (e) {
        console.error('[AudioFilter] Processing failed:', e);
        return dataUri; // Fallback to unprocessed
    }
}

// ─── Ghost: Pitch down 2 semitones + simple reverb ───
async function applyGhostFilter(
    ctx: AudioContext,
    buffer: AudioBuffer
): Promise<AudioBuffer> {
    // Pitch shift by slowing playback and resampling
    const semitones = -3;
    const rate = Math.pow(2, semitones / 12);

    const offlineLength = Math.ceil(buffer.length / rate);
    const offline = new OfflineAudioContext(
        buffer.numberOfChannels,
        offlineLength,
        buffer.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    // Add convolver for reverb effect (simple impulse)
    const convolver = offline.createConvolver();
    const impulse = createReverbImpulse(offline, 1.5, 2.0);
    convolver.buffer = impulse;

    // Dry/wet mix
    const dryGain = offline.createGain();
    dryGain.gain.value = 0.5;
    const wetGain = offline.createGain();
    wetGain.gain.value = 0.5;

    source.connect(dryGain);
    source.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(offline.destination);
    wetGain.connect(offline.destination);

    source.start(0);
    return await offline.startRendering();
}

// ─── Low-Key: Band-pass filter (phone/muffled effect) ───
async function applyLowKeyFilter(
    ctx: AudioContext,
    buffer: AudioBuffer
): Promise<AudioBuffer> {
    const offline = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = buffer;

    // Band-pass: only keep 300Hz - 3400Hz (telephone band)
    const highPass = offline.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 300;
    highPass.Q.value = 0.7;

    const lowPass = offline.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 3400;
    lowPass.Q.value = 0.7;

    // Add subtle distortion for muffled feel
    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 20;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(offline.destination);

    source.start(0);
    return await offline.startRendering();
}

// ─── Robot: Ring modulator effect ───
async function applyRobotFilter(
    ctx: AudioContext,
    buffer: AudioBuffer
): Promise<AudioBuffer> {
    const offline = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = buffer;

    // Ring modulator: multiply signal with sine wave oscillator
    // Create a carrier oscillator
    const oscillator = offline.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 50; // Low frequency for robotic effect

    const oscillatorGain = offline.createGain();
    oscillatorGain.gain.value = 0; // Will be modulated

    // Use gain node as ring modulator
    const ringMod = offline.createGain();
    ringMod.gain.value = 0;

    // Connect oscillator to modulate the gain
    oscillator.connect(ringMod.gain);

    source.connect(ringMod);
    ringMod.connect(offline.destination);

    // Also add dry signal with vocoder-like effect
    const vocoder = offline.createBiquadFilter();
    vocoder.type = 'bandpass';
    vocoder.frequency.value = 800;
    vocoder.Q.value = 5;

    const dryMix = offline.createGain();
    dryMix.gain.value = 0.4;

    const wetMix = offline.createGain();
    wetMix.gain.value = 0.6;

    source.connect(vocoder);
    vocoder.connect(wetMix);
    wetMix.connect(offline.destination);

    source.connect(dryMix);
    dryMix.connect(offline.destination);

    oscillator.start(0);
    source.start(0);
    return await offline.startRendering();
}

// ─── Helper: Create reverb impulse response ───
function createReverbImpulse(
    ctx: OfflineAudioContext,
    duration: number,
    decay: number
): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }

    return impulse;
}

// ─── Helper: AudioBuffer → base64 data URI (WAV) ───
async function audioBufferToDataUri(buffer: AudioBuffer): Promise<string> {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = buffer.length;
    const dataSize = samples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channel data
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
        channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < samples; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = Math.max(-1, Math.min(1, channels[c][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    // Convert to base64
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    return `data:audio/wav;base64,${base64}`;
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
