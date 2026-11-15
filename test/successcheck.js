const assert = require('assert');
const fs = require('fs');
const path = require('path');

const uploadHistory = require('../src/utils/uploadHistory');
const configManager = require('../src/utils/configManager');
const { successContainer, formatDuration, formatSize } = require('../src/utils/convertFlow');
const emoji = require('../src/utils/emoji');

const GUILD = 'success-guild';
const HISTORY_PATH = uploadHistory.HISTORY_PATH;
const backup = fs.existsSync(HISTORY_PATH) ? fs.readFileSync(HISTORY_PATH) : null;

const e = key => emoji.DEFAULTS[key];
const entry = {
    title: 'My Song',
    artist: 'My Artist',
    duration: 192,
    fileSize: 4.2 * 1024 * 1024,
    url: 'http://top4top.io/p_abc/file.mp3',
};

// --- formatting helpers ---
assert.strictEqual(formatDuration(0), '00:00');
assert.strictEqual(formatDuration(59), '00:59');
assert.strictEqual(formatDuration(61), '01:01');
assert.strictEqual(formatDuration(192), '03:12');
assert.strictEqual(formatDuration(undefined), '00:00');
assert.strictEqual(formatSize(0), '0.00 MB');
assert.strictEqual(formatSize(4.2 * 1024 * 1024), '4.20 MB');

// --- success layout ---
const json = successContainer(entry, e).toJSON();
const text = JSON.stringify(json);
assert.strictEqual(json.type, 17, 'root remains a Container');
assert.strictEqual(json.accent_color, 0xffffff, 'success accent must stay white (#FFFFFF)');
assert.match(text, /My Song/);
assert.match(text, /My Artist/);
assert.match(text, /03:12/);
assert.match(text, /4\.20 MB/);
assert.match(text, /http:\/\/top4top\.io\/p_abc\/file\.mp3/, 'raw Top4Top URL must be present');
assert.ok(!/\]\(http/.test(text), 'must not use masked Markdown hyperlinks');
assert.ok(!/Top4Top Direct Link\]\(/.test(text), 'must not hide the URL behind a label');
assert.match(text, /Uploaded via Mila Bot/);
assert.ok(!/Download Audio File/.test(text), 'download button must be gone');
assert.strictEqual(json.components.some(c => c.type === 1), false, 'no ActionRow in success message');
assert.strictEqual(json.components.some(c => c.type === 12), false, 'no MediaGallery in success message');

// --- custom emoji settings are applied ---
const cfg = { emojis: { ...emoji.DEFAULTS, title: '✨', link: '🔗' } };
const custom = JSON.stringify(successContainer(entry, key => emoji.render({ emojis: { cache: { get: () => undefined } } }, cfg, key)).toJSON());
assert.match(custom, /✨ \*\*Title:\*\*/);

// --- integration: one history message per successful upload ---
(async () => {
    if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
    configManager.reset(GUILD);

    const historyChannel = require('../src/utils/historyChannel');
    const sent = [];
    const channel = {
        id: 'hist-1',
        guild: { members: { me: { id: 'bot' } } },
        permissionsFor: () => ({ has: () => true }),
        send: async p => { sent.push(p); return { id: 'm1' }; },
    };
    const client = {
        channels: { fetch: async id => (id === 'hist-1' ? channel : null) },
        emojis: { cache: { get: () => undefined } },
    };

    // not configured -> nothing posted, nothing recorded yet
    let result = await historyChannel.recordAndPost(client, { ...entry, userId: '42', username: 'u', guildId: GUILD });
    assert.strictEqual(result.saved, true, 'record is still saved');
    assert.strictEqual(result.posted, false);
    assert.strictEqual(sent.length, 0, 'no channel configured means no message');

    // configured -> exactly one message with mention and http URL
    configManager.setHistoryChannel(GUILD, 'hist-1');
    result = await historyChannel.recordAndPost(client, { ...entry, userId: '42', username: 'u', guildId: GUILD });
    assert.strictEqual(result.posted, true);
    assert.strictEqual(sent.length, 1, 'one upload produces exactly one message');
    const body = JSON.stringify(sent[0].components[0].toJSON());
    assert.match(body, /My Song - My Artist/);
    assert.match(body, /<@42>/);
    assert.match(body, /http:\/\/top4top\.io\/p_abc\/file\.mp3/);
    assert.ok(!/\]\(http/.test(body), 'history message must not use a masked hyperlink');
    assert.strictEqual(sent[0].flags, 32768, 'history message stays public Components V2 (no Ephemeral)');
    assert.strictEqual(sent[0].flags & 64, 0, 'history message must not be ephemeral');

    // channel deleted -> upload path survives
    const missing = { channels: { fetch: async () => null }, emojis: { cache: { get: () => undefined } } };
    result = await historyChannel.recordAndPost(missing, { ...entry, userId: '42', username: 'u', guildId: GUILD });
    assert.strictEqual(result.posted, false);
    assert.strictEqual(sent.length, 1, 'no message when channel is gone');

    // missing permission -> upload path survives
    channel.permissionsFor = () => ({ has: () => false });
    result = await historyChannel.recordAndPost(client, { ...entry, userId: '42', username: 'u', guildId: GUILD });
    assert.strictEqual(result.posted, false);
    assert.strictEqual(sent.length, 1);

    // send failure -> upload path survives
    channel.permissionsFor = () => ({ has: () => true });
    channel.send = async () => { throw new Error('boom'); };
    result = await historyChannel.recordAndPost(client, { ...entry, userId: '42', username: 'u', guildId: GUILD });
    assert.strictEqual(result.posted, false);

    configManager.reset(GUILD);
    if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
    if (backup) fs.writeFileSync(HISTORY_PATH, backup);

    console.log('success + history channel check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
