const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable CSS support for web (required for Tailwind/NativeWind on web)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'css'];

module.exports = config;
