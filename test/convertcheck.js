const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { MessageFlags } = require('discord.js');

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

const { runConversion, errorPayload } = require('../src/utils/convertFlow');

const V2 = MessageFlags.IsComponentsV2;

// Every edit payload carries V2 components, so it must restate the V2 flag.
function assertV2(payload, label) {
    assert.ok(payload, `${label}: payload missing`);
    assert.strictEqual(
        payload.flags & V2,
        V2,
        `${label}: payload must set MessageFlags.IsComponentsV2 (got flags=${payload.flags})`,
    );
    assert.strictEqual(payload.content, undefined, `${label}: must not send classic content`);
    assert.strictEqual(payload.embeds, undefined, `${label}: must not mix embeds with Components V2`);
    assert.ok(Array.isArray(payload.components) && payload.components.length === 1, `${label}: expected one container`);
    assert.strictEqual(payload.components[0].data.type, 17, `${label}: root component must be a Container (17)`);
}

(async () => {
    const edits = [];
    const interaction = { editReply: async p => { edits.push(p); } };

    await runConversion(interaction, 'https://www.youtube.com/watch?v=abc');
    assert.strictEqual(edits.length, 3, 'processing -> uploading -> success');
    edits.forEach((p, i) => assertV2(p, `stage ${i}`));

    const success = JSON.stringify(edits[2]);
    assert.match(success, /top4top\.io\/p_test\.mp3/);
    assert.match(success, /1:01/);
    assert.strictEqual(fs.existsSync(tmpFile), false, 'temp file must be cleaned up');

    // error payload is a valid V2 message too
    assertV2(errorPayload('boom'), 'errorPayload');

    // unsupported host rejected before any download
    await assert.rejects(() => runConversion(interaction, 'https://example.com/a.mp3'), /Unsupported platform/);

    // upload failure still cleans up the temp file
    fs.writeFileSync(tmpFile, 'fake');
    require.cache[uploaderPath].exports.uploadFile = async () => { throw new Error('upload boom'); };
    await assert.rejects(() => runConversion(interaction, 'https://youtu.be/abc'), /upload boom/);
    assert.strictEqual(fs.existsSync(tmpFile), false, 'temp file must be cleaned up on failure');

    console.log('convert flow check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
