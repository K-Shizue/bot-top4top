const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');

// Isolate the history side-effect; successcheck.js covers it. Must be installed
// before requiring the handler, because convertFlow captures the module at load.
const historyPath = require.resolve('../src/utils/historyChannel');
require.cache[historyPath] = {
    id: historyPath,
    filename: historyPath,
    loaded: true,
    exports: { recordAndPost: async () => ({ saved: true, posted: false }) },
};

const handler = require('../src/handlers/interactionHandler');
const configManager = require('../src/utils/configManager');
const MusicDownloader = require('../src/utils/downloader');
const Top4TopUploader = require('../src/utils/uploader');

const V2 = MessageFlags.IsComponentsV2;
const GUILD = 'modal-guild';
const tmpFile = path.join(__dirname, 'tmp-modal.mp3');

function mockModalInteraction(url) {
    const calls = { defers: [], edits: [], replies: [] };
    const interaction = {
        guildId: GUILD,
        user: { id: 'user-1' },
        client: { application: { owner: { ownerId: 'owner-1' } } },
        memberPermissions: { has: () => true },
        deferred: false,
        replied: false,
        customId: 'panel:convert:modal',
        isButton: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isModalSubmit: () => true,
        fields: { getTextInputValue: () => url },
        deferReply: async opts => {
            assert.ok(!interaction.deferred && !interaction.replied, 'must acknowledge only once');
            calls.defers.push(opts || {});
            interaction.deferred = true;
        },
        editReply: async p => {
            assert.ok(interaction.deferred, 'editReply requires a prior defer');
            calls.edits.push(p);
        },
        reply: async p => { calls.replies.push(p); interaction.replied = true; },
        followUp: async p => { calls.replies.push(p); },
        update: async p => { calls.replies.push(p); },
    };
    return { interaction, calls };
}

function assertV2(payload, label) {
    assert.ok(payload, `${label}: payload missing`);
    assert.strictEqual(payload.flags & V2, V2, `${label}: missing IsComponentsV2 flag`);
    assert.strictEqual(payload.content, undefined, `${label}: classic content must not be sent`);
    assert.strictEqual(payload.embeds, undefined, `${label}: embeds must not be mixed with V2`);
    assert.strictEqual(payload.components[0].data.type, 17, `${label}: root must be Container (17)`);
}

(async () => {
    fs.writeFileSync(tmpFile, 'fake');
    MusicDownloader.downloadAudio = async () => ({ filePath: tmpFile, title: 'T', duration: 61, uploader: 'U', fileSize: 2048, thumbnail: null });
    MusicDownloader.cleanupFile = p => { if (fs.existsSync(p)) fs.unlinkSync(p); };
    Top4TopUploader.uploadFile = async () => 'https://top4top.io/p_modal.mp3';

    // --- success path ---
    let { interaction, calls } = mockModalInteraction('https://youtu.be/abc');
    await handler.handle(interaction);
    assert.strictEqual(calls.defers.length, 1, 'exactly one acknowledgement');
    assert.strictEqual(calls.defers[0].flags & V2, V2, 'deferReply must declare Components V2');
    assert.strictEqual(calls.edits.length, 3, 'processing -> uploading -> success');
    calls.edits.forEach((p, i) => assertV2(p, `success stage ${i}`));
    assert.strictEqual(calls.replies.length, 0, 'no extra reply after a deferred response');

    // --- error path (unsupported host, before any download) ---
    ({ interaction, calls } = mockModalInteraction('https://example.com/a.mp3'));
    await handler.handle(interaction);
    assert.strictEqual(calls.defers.length, 1);
    assert.strictEqual(calls.edits.length, 1, 'error replaces the deferred message');
    assertV2(calls.edits[0], 'error payload');
    assert.strictEqual(calls.replies.length, 0, 'error must not double-reply');

    // --- error path (upload failure) ---
    fs.writeFileSync(tmpFile, 'fake');
    Top4TopUploader.uploadFile = async () => { throw new Error('upload boom'); };
    ({ interaction, calls } = mockModalInteraction('https://youtu.be/abc'));
    await handler.handle(interaction);
    assert.strictEqual(calls.defers.length, 1);
    const last = calls.edits[calls.edits.length - 1];
    assertV2(last, 'upload failure payload');
    assert.match(JSON.stringify(last), /upload boom/);
    assert.strictEqual(fs.existsSync(tmpFile), false, 'temp file cleaned up on failure');

    configManager.reset(GUILD);
    console.log('convert modal check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
