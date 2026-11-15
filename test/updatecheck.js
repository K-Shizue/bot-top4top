const assert = require('assert');
const { ActivityType } = require('discord.js');
const Top4TopUploader = require('../src/utils/uploader');
const { PRESENCE_NAME, streamingUrl, applyPresence } = require('../src/utils/presence');

const n = Top4TopUploader.normalizeTop4TopUrl;

// https -> http
assert.strictEqual(n('https://top4top.io/p_123.mp3'), 'http://top4top.io/p_123.mp3');
assert.strictEqual(n('HTTPS://TOP4TOP.IO/p_123.mp3'), 'http://TOP4TOP.IO/p_123.mp3');
// http unchanged
assert.strictEqual(n('http://top4top.io/p_123.mp3'), 'http://top4top.io/p_123.mp3');
// query string and path preserved
assert.strictEqual(
    n('https://top4top.io/d/abc/file.mp3?token=1&x=2#frag'),
    'http://top4top.io/d/abc/file.mp3?token=1&x=2#frag',
);
// non-strings untouched
assert.strictEqual(n(null), null);
assert.strictEqual(n(undefined), undefined);
// only the protocol is rewritten; a non-http scheme is left alone
assert.strictEqual(n('ftp://top4top.io/x'), 'ftp://top4top.io/x');
// source URLs are never passed through this function
assert.strictEqual(n('https://www.youtube.com/watch?v=abc'), 'http://www.youtube.com/watch?v=abc');

// presence
process.env.STREAMING_URL = 'https://www.twitch.tv/keju';
assert.strictEqual(streamingUrl(), 'https://www.twitch.tv/keju');
assert.strictEqual(PRESENCE_NAME, 'Bot convert by KEJU');

let captured = null;
const fakeClient = { user: { setPresence: p => { captured = p; } } };
assert.strictEqual(applyPresence(fakeClient), true);
assert.strictEqual(captured.activities[0].name, 'Bot convert by KEJU');
assert.strictEqual(captured.activities[0].type, ActivityType.Streaming);
assert.strictEqual(captured.activities[0].url, 'https://www.twitch.tv/keju');
assert.strictEqual(captured.status, 'online');

// invalid / missing config must not throw and must skip presence
for (const bad of ['', '   ', 'not-a-url', 'ftp://example.com/x']) {
    process.env.STREAMING_URL = bad;
    assert.strictEqual(streamingUrl(), null, `expected null for ${JSON.stringify(bad)}`);
    captured = null;
    assert.strictEqual(applyPresence(fakeClient), false);
    assert.strictEqual(captured, null, 'presence must not be set with invalid config');
}

// missing client user must not throw
assert.strictEqual(applyPresence({}), false);
assert.strictEqual(applyPresence(undefined), false);

delete process.env.STREAMING_URL;

console.log('update check: all assertions passed');
