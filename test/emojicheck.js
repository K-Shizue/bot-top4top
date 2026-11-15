const assert = require('assert');
const emoji = require('../src/utils/emoji');
const configManager = require('../src/utils/configManager');

const GUILD_A = 'emoji-guild-a';
const GUILD_B = 'emoji-guild-b';

const fakeClient = (ids = []) => ({ emojis: { cache: { get: id => (ids.includes(id) ? { id } : undefined) } } });

const DEFAULTS = emoji.DEFAULTS;

// --- parsing ---
assert.deepStrictEqual(emoji.parse('🎵'), { kind: 'unicode', raw: '🎵' });
const staticEmoji = emoji.parse('<:note:123456789012345678>');
assert.strictEqual(staticEmoji.kind, 'custom');
assert.strictEqual(staticEmoji.name, 'note');
assert.strictEqual(staticEmoji.id, '123456789012345678');
assert.strictEqual(staticEmoji.animated, false);
const animated = emoji.parse('<a:dance:987654321098765432>');
assert.strictEqual(animated.animated, true);
assert.strictEqual(animated.id, '987654321098765432');

// --- invalid forms rejected ---
for (const bad of ['<:note:abc>', '<:note:123>', '<<:note:1>>', 'not an emoji', ':', '<>', '<:a b:123456789012345678>']) {
    assert.strictEqual(emoji.parse(bad), null, `should reject ${JSON.stringify(bad)}`);
}

// --- validation on save ---
assert.strictEqual(emoji.normalizeValue('✨', 'title'), '✨');
assert.strictEqual(emoji.normalizeValue('<:note:123456789012345678>', 'title'), '<:note:123456789012345678>');
assert.strictEqual(emoji.normalizeValue('<a:dance:987654321098765432>', 'link'), '<a:dance:987654321098765432>');
assert.strictEqual(emoji.normalizeValue('', 'title'), DEFAULTS.title, 'empty falls back to default');
assert.throws(() => emoji.normalizeValue('<:broken:notanid>', 'title'), /Invalid emoji/);
assert.throws(() => emoji.normalizeValue('plain text', 'size'), /Invalid emoji/);

// --- rendering: custom emoji used only when resolvable ---
const customCfg = { emojis: { ...DEFAULTS, title: '<:note:123456789012345678>' } };
assert.strictEqual(emoji.render(fakeClient(['123456789012345678']), customCfg, 'title'), '<:note:123456789012345678>');
assert.strictEqual(emoji.render(fakeClient([]), customCfg, 'title'), DEFAULTS.title, 'unavailable emoji falls back');
assert.strictEqual(emoji.render(fakeClient(), { emojis: { ...DEFAULTS, title: '🎶' } }, 'title'), '🎶');
assert.strictEqual(emoji.render(fakeClient(), null, 'artist'), DEFAULTS.artist, 'missing config falls back');
assert.strictEqual(emoji.render(fakeClient(), { emojis: { title: 'garbage' } }, 'title'), DEFAULTS.title, 'corrupt value falls back');

// --- persistence per guild ---
configManager.setEmojis(GUILD_A, { title: '✨', link: '<:lop:123456789012345678>' });
assert.strictEqual(configManager.get(GUILD_A).emojis.title, '✨');
assert.strictEqual(configManager.get(GUILD_A).emojis.link, '<:lop:123456789012345678>');
assert.strictEqual(configManager.get(GUILD_A).emojis.artist, DEFAULTS.artist, 'untouched keys keep defaults');

// other guild is not affected
assert.strictEqual(configManager.get(GUILD_B).emojis.title, DEFAULTS.title);

configManager.setEmojis(GUILD_B, { title: '🔥' });
assert.strictEqual(configManager.get(GUILD_B).emojis.title, '🔥');
assert.strictEqual(configManager.get(GUILD_A).emojis.title, '✨', 'guild configs must not mix');

// defaults survive a reset
configManager.reset(GUILD_A);
assert.deepStrictEqual(configManager.get(GUILD_A).emojis, DEFAULTS);

configManager.reset(GUILD_A);
configManager.reset(GUILD_B);
console.log('emoji check: all assertions passed');
