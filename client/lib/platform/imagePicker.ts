import { Platform } from 'react-native';

export interface PickedImage {
    base64DataUri: string;
    width?: number;
    height?: number;
}

const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024; // 1.5MB

export async function pickImage(quality: number = 0.5): Promise<PickedImage | null> {
    if (Platform.OS === 'web') {
        return pickImageWeb(quality);
    }
    return pickImageNative(quality);
}

// --- Web Implementation ---
function pickImageWeb(_quality: number): Promise<PickedImage | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            // Compress using canvas if needed
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (ev) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Scale down if very large
                    let w = img.width;
                    let h = img.height;
                    const maxDim = 1200;
                    if (w > maxDim || h > maxDim) {
                        const scale = maxDim / Math.max(w, h);
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUri = canvas.toDataURL('image/jpeg', 0.5);

                    if (dataUri.length > MAX_IMAGE_SIZE) {
                        // Try lower quality
                        const lowQualityUri = canvas.toDataURL('image/jpeg', 0.2);
                        if (lowQualityUri.length > MAX_IMAGE_SIZE) {
                            resolve(null);
                            return;
                        }
                        resolve({ base64DataUri: lowQualityUri, width: w, height: h });
                        return;
                    }

                    resolve({ base64DataUri: dataUri, width: w, height: h });
                };
                img.src = ev.target?.result as string;
            };
            reader.readAsDataURL(file);
        };

        input.oncancel = () => resolve(null);
        input.click();
    });
}

// --- Native Implementation ---
async function pickImageNative(quality: number): Promise<PickedImage | null> {
    const ImagePicker = require('expo-image-picker');

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality,
    });

    if (result.canceled || !result.assets[0]?.base64) {
        return null;
    }

    const asset = result.assets[0];
    const dataUri = `data:image/jpeg;base64,${asset.base64}`;

    if (dataUri.length > MAX_IMAGE_SIZE) {
        // Retry with lower quality
        const lowRes = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.2,
        });
        if (lowRes.canceled || !lowRes.assets[0]?.base64) return null;
        const lowUri = `data:image/jpeg;base64,${lowRes.assets[0].base64}`;
        if (lowUri.length > MAX_IMAGE_SIZE) return null;
        return { base64DataUri: lowUri, width: lowRes.assets[0].width, height: lowRes.assets[0].height };
    }

    return { base64DataUri: dataUri, width: asset.width, height: asset.height };
}
