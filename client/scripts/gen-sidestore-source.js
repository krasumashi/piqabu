/**
 * Generates a SideStore / AltStore "source" manifest (apps.json).
 *
 * A source is a JSON file users add to SideStore once; they can then
 * install AND auto-update Piqabu from inside SideStore, instead of
 * re-downloading .ipa files. The CI publishes this alongside the .ipa on
 * every build so version + size stay in sync automatically.
 *
 * Usage (from client/):
 *   node scripts/gen-sidestore-source.js <ipaPath> <outPath>
 */
const fs = require('fs');

const ipaPath = process.argv[2];
const outPath = process.argv[3] || 'apps.json';

if (!ipaPath || !fs.existsSync(ipaPath)) {
    console.error('[gen-sidestore-source] IPA not found:', ipaPath);
    process.exit(1);
}

const app = require('../app.json').expo;
const size = fs.statSync(ipaPath).size;
const date = new Date().toISOString().slice(0, 10);

const REPO = 'krasumashi/piqabu';
const downloadURL = `https://github.com/${REPO}/releases/download/ios-latest/Piqabu.ipa`;
const iconURL = `https://raw.githubusercontent.com/${REPO}/main/client/assets/icon.png`;
const description =
    'Piqabu is a privacy-first, ephemeral messaging app. No accounts, no history — ' +
    'generate a code, share it with one person, and talk over a private channel that ' +
    'leaves no trace. Text, Reveal/Peek, Whisper (push-to-talk audio) and Live Glass ' +
    '(live video) all run peer-to-peer. Developed in Ghana by AhTohMoh.';

const source = {
    name: 'Piqabu',
    identifier: 'live.piqabu.source',
    subtitle: 'Private, ephemeral messaging. Zero trace.',
    iconURL,
    website: 'https://piqabu.live',
    tintColor: '#060709',
    apps: [
        {
            name: 'Piqabu',
            bundleIdentifier: app.ios.bundleIdentifier,
            developerName: 'AhTohMoh',
            subtitle: 'Private, ephemeral messaging. Zero trace.',
            localizedDescription: description,
            iconURL,
            tintColor: '#060709',
            version: app.version,
            versionDate: date,
            versionDescription: 'Latest automated build.',
            downloadURL,
            size,
        },
    ],
    news: [],
};

fs.writeFileSync(outPath, JSON.stringify(source, null, 2));
console.log(`[gen-sidestore-source] Wrote ${outPath} — version=${app.version} size=${size}`);
