import { Platform } from 'react-native';

export interface AudioRecorder {
    start: () => Promise<void>;
    stop: () => Promise<string | null>; // Returns base64 data URI or null
    isRecording: () => boolean;
}

export async function createAudioRecorder(): Promise<AudioRecorder> {
    if (Platform.OS === 'web') {
        return createWebAudioRecorder();
    }
    return createNativeAudioRecorder();
}

// --- Web Implementation ---
function createWebAudioRecorder(): AudioRecorder {
    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let recording = false;

    return {
        start: async () => {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            chunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.start(100); // Collect data every 100ms
            recording = true;
        },

        stop: async () => {
            return new Promise((resolve) => {
                if (!mediaRecorder || !recording) {
                    resolve(null);
                    return;
                }

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = reader.result as string;
                        resolve(base64);
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);

                    // Stop all tracks
                    mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
                    mediaRecorder = null;
                    recording = false;
                };

                mediaRecorder.stop();
            });
        },

        isRecording: () => recording,
    };
}

// --- Native Implementation ---
function createNativeAudioRecorder(): AudioRecorder {
    const { Audio } = require('expo-av');
    const FileSystem = require('expo-file-system');
    let recording: any = null;

    return {
        start: async () => {
            const permResult = await Audio.requestPermissionsAsync();
            if (permResult.status !== 'granted') {
                throw new Error('PERMISSION_DENIED');
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.LOW_QUALITY
            );
            recording = rec;
        },

        stop: async () => {
            if (!recording) return null;
            const rec = recording;
            recording = null;
            await rec.stopAndUnloadAsync();
            const uri = rec.getURI();
            if (!uri) return null;
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return `data:audio/mp4;base64,${base64}`;
        },

        isRecording: () => recording !== null,
    };
}

// --- Playback ---
export async function playAudioFromDataUri(dataUri: string, rate: number = 1.0): Promise<void> {
    if (Platform.OS === 'web') {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = dataUri;
            audio.playbackRate = rate;
            audio.onended = () => resolve();
            audio.onerror = (e) => reject(e);
            audio.play().catch(reject);
        });
    }

    const { Audio } = require('expo-av');
    const FileSystem = require('expo-file-system');

    // Set audio mode for playback (disable recording mode)
    await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
    });

    // Write base64 to temp file for reliable Android playback
    let playUri = dataUri;
    let tempFile: string | null = null;
    try {
        const base64Data = dataUri.split(',')[1];
        if (base64Data) {
            tempFile = FileSystem.cacheDirectory + 'whisper_play_' + Date.now() + '.mp4';
            await FileSystem.writeAsStringAsync(tempFile, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
            });
            playUri = tempFile;
        }
    } catch (e) {
        console.warn('[Audio] Temp file write failed, using data URI:', e);
    }

    try {
        const { sound } = await Audio.Sound.createAsync(
            { uri: playUri },
            { shouldPlay: true, rate, shouldCorrectPitch: false }
        );

        return await new Promise<void>((resolve) => {
            // Timeout safety: resolve after 10s max to prevent hanging
            const timeout = setTimeout(() => {
                sound.unloadAsync().catch(() => {});
                resolve();
            }, 10000);

            sound.setOnPlaybackStatusUpdate((status: any) => {
                if (status.didJustFinish) {
                    clearTimeout(timeout);
                    sound.unloadAsync().catch(() => {});
                    resolve();
                }
            });
        });
    } finally {
        // Clean up temp file
        if (tempFile) {
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
        }
    }
}
