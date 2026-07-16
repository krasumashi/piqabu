/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'keyboard',
  name: 'PiqabuKeyboard',
  displayName: 'Piqabu',
  bundleIdentifier: '.keyboard',
  deploymentTarget: '15.1',
  frameworks: ['UIKit'],
  // Deliberately no App Group or network entitlement. The keyboard mints
  // links locally and remains useful without iOS "Full Access".
  entitlements: {},
});
