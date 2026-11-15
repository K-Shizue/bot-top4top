const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tmpFile = path.join(__dirname, 'tmp-upload.mp3');
fs.writeFileSync(tmpFile, 'fake-audio');

// Mock axios so the real uploader pipeline (parse sid -> post -> parse link) runs offline.
const axiosPath = require.resolve('axios');
require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: {
        get: async () => ({
            status: 200,
            data: '<html><body><form><input type="hidden" name="sid" value="SID123"></form></body></html>',
        }),
        post: async () => ({
            status: 200,
            data: '<html><body><textarea>https://top4top.io/p_9999abc/file.mp3?dl=1</textarea></body></html>',
        }),
    },
};

const Top4TopUploader = require('../src/utils/uploader');

(async () => {
    const link = await Top4TopUploader.uploadFile(tmpFile);
    assert.strictEqual(link, 'http://top4top.io/p_9999abc/file.mp3?dl=1');
    assert.ok(!/^https:/i.test(link), 'upload result must not use https');
    assert.ok(link.includes('?dl=1'), 'query string must be preserved');

    // The same normalizer is what /upload and the panel Convert button consume.
    const edits = [];
    const interaction = { editReply: async p => { edits.push(p); } };

    // Stub only the download stage; the real uploader (and its normalization) stays in play.
    const downloaderPath = require.resolve('../src/utils/downloader');
    require.cache[downloaderPath] = {
        id: downloaderPath,
        filename: downloaderPath,
        loaded: true,
        exports: {
            downloadAudio: async () => ({ filePath: tmpFile, title: 'T', duration: 5, uploader: 'U', fileSize: 1024, thumbnail: null }),
            cleanupFile: () => {},
        },
    };
    delete require.cache[require.resolve('../src/utils/convertFlow')];
    // Isolate the history side-effect; successcheck.js covers it.
    const historyPath = require.resolve('../src/utils/historyChannel');
    require.cache[historyPath] = {
        id: historyPath,
        filename: historyPath,
        loaded: true,
        exports: { recordAndPost: async () => ({ saved: true, posted: false }) },
    };
    const flow = require('../src/utils/convertFlow');

    await flow.runConversion(interaction, 'https://youtu.be/abc');
    const final = JSON.stringify(edits[edits.length - 1]);
    assert.match(final, /\(http:\/\/top4top\.io\/p_9999abc\/file\.mp3\?dl=1\)/, 'panel/upload reply must show the http link');
    assert.ok(!final.includes('https://top4top.io'), 'reply must not contain an https Top4Top link');

    console.log('uploader check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); }).finally(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});
