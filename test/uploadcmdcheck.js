const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');

// Isolate side effects. Must be installed before requiring the command.
const downloaderPath = require.resolve('../src/utils/downloader');
const uploaderPath = require.resolve('../src/utils/uploader');
const historyPath = require.resolve('../src/utils/historyChannel');
const tmpFile = path.join(__dirname, 'tmp-uploadcmd.mp3');
fs.writeFileSync(tmpFile, 'fake');

let downloadFails = false;
let uploadFails = false;

require.cache[downloaderPath] = {
    id: downloaderPath,
    filename: downloaderPath,
    loaded: true,
    exports: {
        downloadAudio: async () => {
            if (downloadFails) throw new Error('download boom');
            return { filePath: tmpFile, title: 'Song', duration: 181, uploader: 'Artist', fileSize: 4.15 * 1024 * 1024, thumbnail: 'http://img/x.jpg' };
        },
        cleanupFile: () => {},
    },
};
require.cache[uploaderPath] = {
    id: uploaderPath,
    filename: uploaderPath,
    loaded: true,
    exports: {
        uploadFile: async () => {
            if (uploadFails) throw new Error('upload boom');
            return 'http://c.top4top.io/m_xxxxx.mp3';
        },
    },
};
require.cache[historyPath] = {
    id: historyPath,
    filename: historyPath,
    loaded: true,
    exports: { recordAndPost: async () => ({ saved: true, posted: false }) },
};

const uploadCommand = require('../src/commands/upload');

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

function mockCommandInteraction(url = 'https://youtu.be/abc') {
    const calls = { defers: [], edits: [], replies: [], followUps: [] };
    const interaction = {
        guildId: 'uploadcmd-guild',
        user: { id: 'u1', username: 'user' },
        client: { emojis: { cache: { get: () => undefined } } },
        deferred: false,
        replied: false,
        options: { getString: () => url },
        deferReply: async opts => {
            assert.ok(!interaction.deferred && !interaction.replied, 'must acknowledge exactly once');
            calls.defers.push(opts || {});
            interaction.deferred = true;
        },
        editReply: async p => {
            assert.ok(interaction.deferred, 'editReply requires the initial defer');
            calls.edits.push(p);
        },
        reply: async p => { calls.replies.push(p); interaction.replied = true; },
        followUp: async p => { calls.followUps.push(p); },
    };
    return { interaction, calls };
}

(async () => {
    // --- success path: ephemeral from the first acknowledgement ---
    let { interaction, calls } = mockCommandInteraction();
    await uploadCommand.execute(interaction);

    assert.strictEqual(calls.defers.length, 1, 'exactly one acknowledgement');
    assert.strictEqual(calls.defers[0].flags & V2, V2, 'defer must declare Components V2');
    assert.strictEqual(calls.defers[0].flags & EPHEMERAL, EPHEMERAL, 'defer must be ephemeral');
    assert.strictEqual(calls.replies.length, 0, 'no public reply');
    assert.strictEqual(calls.followUps.length, 0, 'no public followUp');

    assert.strictEqual(calls.edits.length, 3, 'processing -> uploading -> success');
    for (const [i, payload] of calls.edits.entries()) {
        assert.strictEqual(payload.flags & V2, V2, `edit ${i} must keep the V2 flag`);
        assert.strictEqual(payload.content, undefined, `edit ${i} must not send classic content`);
        assert.strictEqual(payload.embeds, undefined, `edit ${i} must not mix embeds`);
        assert.strictEqual(payload.components[0].data.type, 17, `edit ${i} root must be a Container`);
    }

    const success = calls.edits[2].components[0].toJSON();
    const successText = JSON.stringify(success);
    assert.strictEqual(success.accent_color, 0xffffff, 'success accent must be white');
    assert.match(successText, /Song/);
    assert.match(successText, /Artist/);
    assert.match(successText, /03:01/);
    assert.match(successText, /4\.15 MB/);
    assert.match(successText, /http:\/\/c\.top4top\.io\/m_xxxxx\.mp3/, 'raw URL shown');
    assert.ok(!/\]\(http/.test(successText), 'no masked hyperlink');
    assert.ok(!/Top4Top Direct Link\]\(/.test(successText), 'no labeled hyperlink');
    assert.ok(!/Download Audio File/.test(successText), 'no download button');
    assert.strictEqual(success.components.some(c => c.type === 1), false, 'no ActionRow');
    assert.strictEqual(success.components.some(c => c.type === 12), false, 'no MediaGallery');
    assert.match(successText, /Uploaded via Mila Bot/);

    // --- download failure: ephemeral error, single ack, no double reply ---
    downloadFails = true;
    ({ interaction, calls } = mockCommandInteraction());
    await uploadCommand.execute(interaction);
    assert.strictEqual(calls.defers.length, 1);
    assert.strictEqual(calls.defers[0].flags & EPHEMERAL, EPHEMERAL, 'error path stays ephemeral');
    assert.strictEqual(calls.edits.length, 2, 'processing -> error');
    const errorPayload = calls.edits[calls.edits.length - 1];
    assert.strictEqual(errorPayload.flags & V2, V2, 'error payload is V2');
    assert.match(JSON.stringify(errorPayload), /download boom/);
    assert.strictEqual(calls.replies.length, 0);
    assert.strictEqual(calls.followUps.length, 0);
    downloadFails = false;

    // --- upload failure: same guarantees ---
    uploadFails = true;
    ({ interaction, calls } = mockCommandInteraction());
    await uploadCommand.execute(interaction);
    assert.strictEqual(calls.defers.length, 1);
    assert.strictEqual(calls.edits.length, 3, 'processing -> uploading -> error');
    assert.strictEqual(calls.edits[2].flags & V2, V2);
    assert.match(JSON.stringify(calls.edits[2]), /upload boom/);
    assert.strictEqual(calls.replies.length, 0);
    assert.strictEqual(calls.followUps.length, 0);
    uploadFails = false;

    // --- unsupported URL: rejected before any download, still ephemeral ---
    ({ interaction, calls } = mockCommandInteraction('https://example.com/a.mp3'));
    await uploadCommand.execute(interaction);
    assert.strictEqual(calls.defers.length, 1);
    assert.strictEqual(calls.defers[0].flags & EPHEMERAL, EPHEMERAL);
    assert.match(JSON.stringify(calls.edits[0]), /Unsupported platform/);

    console.log('upload command check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); }).finally(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});
