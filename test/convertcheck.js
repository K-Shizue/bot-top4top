const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Stub the pipeline so /upload and panel Convert can be exercised without network.
const downloaderPath = require.resolve('../src/utils/downloader');
const uploaderPath = require.resolve('../src/utils/uploader');
const tmpFile = path.join(__dirname, 'tmp-audio.mp3');
fs.writeFileSync(tmpFile, 'fake');

require.cache[downloaderPath] = {
    id: downloaderPath,
    filename: downloaderPath,
    loaded: true,
    exports: {
        downloadAudio: async url => ({ filePath: tmpFile, title: 'T', duration: 61, uploader: 'U', fileSize: 2048, thumbnail: null }),
        cleanupFile: p => { if (fs.existsSync(p)) fs.unlinkSync(p); },
    },
};
require.cache[uploaderPath] = {
    id: uploaderPath,
    filename: uploaderPath,
    loaded: true,
    exports: { uploadFile: async () => 'https://top4top.io/p_test.mp3' },
};

const { runConversion } = require('../src/utils/convertFlow');

(async () => {
    const edits = [];
    const interaction = { editReply: async p => { edits.push(p); } };

    await runConversion(interaction, 'https://www.youtube.com/watch?v=abc');
    assert.strictEqual(edits.length, 3, 'processing -> uploading -> success');
    const success = JSON.stringify(edits[2]);
    assert.match(success, /top4top\.io\/p_test\.mp3/);
    assert.match(success, /1:01/);
    assert.strictEqual(fs.existsSync(tmpFile), false, 'temp file must be cleaned up');

    // unsupported host rejected before any download
    await assert.rejects(() => runConversion(interaction, 'https://example.com/a.mp3'), /Unsupported platform/);

    // upload failure still cleans up the temp file
    fs.writeFileSync(tmpFile, 'fake');
    require.cache[uploaderPath].exports.uploadFile = async () => { throw new Error('upload boom'); };
    await assert.rejects(() => runConversion(interaction, 'https://youtu.be/abc'), /upload boom/);
    assert.strictEqual(fs.existsSync(tmpFile), false, 'temp file must be cleaned up on failure');

    console.log('convert flow check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
