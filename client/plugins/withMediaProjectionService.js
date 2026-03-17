/**
 * Expo config plugin to ensure the react-native-webrtc foreground service
 * is declared with foregroundServiceType="mediaProjection" in AndroidManifest.xml.
 *
 * Without this, getDisplayMedia() fails on Android because the system
 * requires a foreground service of type mediaProjection to be running.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withMediaProjectionService(config) {
    return withAndroidManifest(config, async (config) => {
        const manifest = config.modResults;
        const application = manifest.manifest.application?.[0];

        if (!application) return config;

        // Ensure services array exists
        if (!application.service) {
            application.service = [];
        }

        // The service used by react-native-webrtc for screen capture
        const serviceName = 'com.oney.WebRTCModule.WebRTCModuleService';
        const existing = application.service.find(
            (s) => s.$?.['android:name'] === serviceName,
        );

        if (existing) {
            // Ensure foregroundServiceType is set
            existing.$['android:foregroundServiceType'] = 'mediaProjection';
        } else {
            application.service.push({
                $: {
                    'android:name': serviceName,
                    'android:enabled': 'true',
                    'android:exported': 'false',
                    'android:foregroundServiceType': 'mediaProjection',
                },
            });
        }

        return config;
    });
};
