const p = require('../src/utils/panelBuilder');
const configManager = require('../src/utils/configManager');

const cfg = configManager.DEFAULTS;
const client = { emojis: { cache: { get: () => undefined } } };

// Every payload must serialize to valid JSON without throwing.
for (const cat of Object.keys(p.CATEGORIES)) {
    p.dashboardPayload(cfg, cat).components[0].toJSON();
}
p.panelPayload(cfg).components[0].toJSON();
p.infoPayload(cfg).components[0].toJSON();
p.fieldModal(cfg, 'accentColor').toJSON();
p.notice('hello').components[0].toJSON();
p.cookiesPayload({ exists: false, auth: { state: 'unknown' } }).components[0].toJSON();
p.historyChannelPayload(cfg).components[0].toJSON();
p.historyChannelPayload(cfg, { selectedId: '123' }).components[0].toJSON();
p.deploySelectPayload(cfg).components[0].toJSON();
p.deployConfirmPayload(cfg, '123').components[0].toJSON();
p.emojiSettingsPayload(cfg, client).components[0].toJSON();
p.emojiSettingsPayload(cfg, client, { preview: { title: '✨' } }).components[0].toJSON();
p.emojiModal('title').toJSON();

// Channel selects must be restricted to text channels.
const deploy = p.deploySelectPayload(cfg).components[0].toJSON();
const select = deploy.components.find(c => c.type === 1).components[0];
if (!Array.isArray(select.channel_types)) throw new Error('channel select must restrict channel types');
if (!select.channel_types.every(t => t === 0 || t === 5)) throw new Error('only text channels allowed');

// Ephemeral admin payloads keep both flags.
for (const payload of [p.historyChannelPayload(cfg), p.deploySelectPayload(cfg), p.emojiSettingsPayload(cfg, client)]) {
    if (payload.flags !== (32768 | 64)) throw new Error('admin payloads must be ephemeral V2');
}

console.log('payloads ok');
