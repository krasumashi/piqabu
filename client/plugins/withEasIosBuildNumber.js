/**
 * Keep generated iOS extension build numbers aligned with the parent app.
 *
 * EAS exposes the resolved remote build number while evaluating the Expo
 * config. @bacons/apple-targets otherwise reads the stale local buildNumber
 * for keyboard extensions, which makes App Store validation reject the IPA.
 */
module.exports = function withEasIosBuildNumber(config) {
  const buildNumber = process.env.EAS_BUILD_IOS_BUILD_NUMBER;

  if (!buildNumber) {
    return config;
  }

  if (!/^\d+$/.test(buildNumber)) {
    throw new Error(
      `Invalid EAS_BUILD_IOS_BUILD_NUMBER: expected digits, received "${buildNumber}"`,
    );
  }

  config.ios = {
    ...config.ios,
    buildNumber,
  };

  return config;
};
