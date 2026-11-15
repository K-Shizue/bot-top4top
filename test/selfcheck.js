const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const configManager = require('../src/utils/configManager');
const cookiesManager = require('../src/utils/cookiesManager');
const { validateUrl } = require('../src/utils/convertFlow');
const panelBuilder = require('../src/utils/panelBuilder');

const GUILD = 'test-guild-123';

// config: defaults, set, validation, persistence, reset
const defaults = configManager.get(GUILD);
assert.strictEqual(defaults.title, configManager.DEFAULTS.title);
configManager.set(GUILD, { title: 'My Panel', accentColor: '#FF0000', bannerUrl: 'https://example.com/b.png' });
const saved = configManager.get(GUILD);
assert.strictEqual(saved.title, 'My Panel');
assert.strictEqual(saved.accentColor, '#ff0000');
assert.strictEqual(panelBuilder.accent(saved), 0xff0000);
assert.throws(() => configManager.set(GUILD, { accentColor: 'red' }), /hex/);
assert.throws(() => configManager.set(GUILD, { bannerUrl: 'javascript:alert(1)' }), /http/);
assert.throws(() => configManager.set(GUILD, { convertButtonStyle: '9' }), /1-4/);
assert.throws(() => configManager.set(GUILD, { title: '' }), /1-100/);
configManager.setDeployment(GUILD, 'chan1', 'msg1');
assert.strictEqual(configManager.get(GUILD).panelMessageId, 'msg1');

// other guilds untouched
configManager.set('other-guild', { title: 'Other' });
assert.strictEqual(configManager.get(GUILD).title, 'My Panel');
configManager.reset(GUILD);
assert.strictEqual(configManager.get(GUILD).title, configManager.DEFAULTS.title);
configManager.reset('other-guild');

// url validation
assert.strictEqual(validateUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
assert.throws(() => validateUrl('https://evil.com/x'), /Unsupported/);
assert.throws(() => validateUrl('not a url'), /valid URL/);
assert.throws(() => validateUrl('file:///etc/passwd'), /http or https|Unsupported/);

// cookies format
const good = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tabc123\n';
const ok = cookiesManager.validateContent(good);
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.count, 1);
assert.strictEqual(cookiesManager.validateContent('').ok, false);
assert.strictEqual(cookiesManager.validateContent('{"cookies":[]}').ok, false);
assert.strictEqual(cookiesManager.validateContent('.youtube.com\tTRUE\t/\tTRUE\tnotanumber\tSID\tabc').ok, false);
assert.strictEqual(cookiesManager.validateContent('.youtube.com\tTRUE\t/\tTRUE\t123\tSID\t').ok, false);
assert.strictEqual(cookiesManager.validateContent('# only comments\n').ok, false);

// save / status / delete round trip (restores any existing file afterwards)
const backup = fs.existsSync(cookiesManager.COOKIES_PATH) ? fs.readFileSync(cookiesManager.COOKIES_PATH) : null;
try {
    cookiesManager.save(Buffer.from(good));
    const st = cookiesManager.status();
    assert.strictEqual(st.exists, true);
    assert.strictEqual(st.formatOk, true);
    assert.strictEqual(st.count, 1);
    assert.throws(() => cookiesManager.save(Buffer.from('garbage')), /Invalid cookies/);
    assert.strictEqual(cookiesManager.status().formatOk, true, 'invalid upload must not overwrite stored file');
    cookiesManager.remove();
    assert.strictEqual(cookiesManager.status().exists, false);
} finally {
    if (backup) cookiesManager.save(backup); else cookiesManager.remove();
}

// failure classification
assert.strictEqual(cookiesManager.classifyFailure('ERROR: Sign in to confirm you are not a bot'), 'auth_rejected');
assert.strictEqual(cookiesManager.classifyFailure('getaddrinfo ENOTFOUND youtube.com'), 'network_error');
assert.strictEqual(cookiesManager.classifyFailure('This video is private'), 'restricted');

// panel payload builds without throwing
const payload = panelBuilder.panelPayload(configManager.get(GUILD));
assert.strictEqual(payload.flags, 32768);
assert.strictEqual(payload.components.length, 1);
assert.ok(panelBuilder.infoPayload(configManager.get(GUILD)).components.length === 1);
assert.ok(panelBuilder.dashboardPayload(configManager.get(GUILD), 'manage').components.length >= 1);
assert.ok(panelBuilder.fieldModal(configManager.get(GUILD), 'title'));

console.log('self-check: all assertions passed');
