const test = require('node:test');
const assert = require('node:assert/strict');
const { getSafeUploadExtension } = require('../lib/uploadFilename');

test('keeps a safe extension supplied by Android and web uploads', () => {
    assert.equal(getSafeUploadExtension('clip.MP4', 'video/mp4'), '.mp4');
    assert.equal(getSafeUploadExtension('brief.pdf', 'application/pdf'), '.pdf');
});

test('recovers iOS video and PDF extensions from MIME type', () => {
    assert.equal(getSafeUploadExtension('IMG_0042', 'video/quicktime'), '.mov');
    assert.equal(getSafeUploadExtension('recording', 'video/mp4; charset=binary'), '.mp4');
    assert.equal(getSafeUploadExtension('document', 'application/pdf'), '.pdf');
});

test('uses a neutral extension for unknown extensionless uploads', () => {
    assert.equal(getSafeUploadExtension('attachment', 'application/octet-stream'), '.bin');
});
