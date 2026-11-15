const assert = require('assert');
process.env.COOKIE_ADMIN_IDS = 'admin-1';

const handler = require('../src/handlers/interactionHandler');
const configManager = require('../src/utils/configManager');
const cookiesManager = require('../src/utils/cookiesManager');

const GUILD = 'mock-guild';
const ManageGuild = 32n;

function mockInteraction(overrides = {}) {
    const calls = { replies: [], updates: [], edits: [], modals: [], sent: [] };
    const interaction = {
        guildId: GUILD,
        user: { id: 'admin-1' },
        client: { application: { owner: { ownerId: 'owner-1' } } },
        memberPermissions: { has: () => true },
        deferred: false,
        replied: false,
        customId: '',
        values: [],
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        reply: async p => { calls.replies.push(p); interaction.replied = true; },
        update: async p => { calls.updates.push(p); interaction.replied = true; },
        editReply: async p => { calls.edits.push(p); },
        followUp: async p => { calls.replies.push(p); },
        deferReply: async () => { interaction.deferred = true; },
        showModal: async m => { calls.modals.push(m); },
        channel: {
            id: 'chan-1',
            send: async p => { calls.sent.push(p); return { id: 'msg-new' }; },
            messages: { fetch: async () => { throw new Error('Unknown Message'); } },
        },
        fields: { getTextInputValue: () => 'https://youtu.be/abc' },
        ...overrides,
    };
    return { interaction, calls };
}

(async () => {
    // button: preview
    let { interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:preview' });
    await handler.handle(interaction);
    assert.strictEqual(calls.replies.length, 1);
    assert.strictEqual(calls.replies[0].flags, 32768 | 64);

    // button: field -> modal
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:field:title' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.modals.length, 1);
    assert.strictEqual(calls.modals[0].data.custom_id, 'setup:modal:title');

    // modal submit -> saves config
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:modal:title',
        fields: { getTextInputValue: () => 'Guild Panel Title' },
    }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).title, 'Guild Panel Title');
    assert.strictEqual(calls.replies.length, 1);

    // invalid modal value -> rejected, config unchanged
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:modal:accentColor',
        fields: { getTextInputValue: () => 'nope' },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Invalid value/);
    assert.strictEqual(configManager.get(GUILD).accentColor, configManager.DEFAULTS.accentColor);

    // select menu -> category switch
    ({ interaction, calls } = mockInteraction({ isStringSelectMenu: () => true, customId: 'setup:cat', values: ['manage'] }));
    await handler.handle(interaction);
    assert.strictEqual(calls.updates.length, 1);
    assert.match(JSON.stringify(calls.updates[0]), /Panel Management/);

    // deploy with no previous message -> sends + persists ids
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:deploy' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.sent.length, 1);
    assert.strictEqual(configManager.get(GUILD).panelMessageId, 'msg-new');
    assert.strictEqual(configManager.get(GUILD).panelChannelId, 'chan-1');

    // deploy again with existing message -> edits in place, no duplicate
    ({ interaction, calls } = mockInteraction({
        isButton: () => true,
        customId: 'setup:deploy',
        channel: {
            id: 'chan-1',
            send: async p => { calls.sent.push(p); return { id: 'dup' }; },
            messages: { fetch: async () => ({ edit: async p => { calls.edits.push(p); } }) },
        },
    }));
    await handler.handle(interaction);
    assert.strictEqual(calls.sent.length, 0, 'must not create a duplicate panel');
    assert.strictEqual(calls.edits.length, 2, 'one panel edit + one deferred reply');
    assert.match(JSON.stringify(calls.edits[0]), /type.*17|components/);

    // panel:info
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'panel:info' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.replies.length, 1);
    assert.match(JSON.stringify(calls.replies[0]), /Converter Information/);

    // panel:convert -> modal
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'panel:convert' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.modals[0].data.custom_id, 'panel:convert:modal');

    // non-admin blocked on setup button
    ({ interaction, calls } = mockInteraction({
        isButton: () => true,
        customId: 'setup:reset',
        memberPermissions: { has: () => false },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Manage Server permission required/);

    // non-admin blocked on cookies button
    ({ interaction, calls } = mockInteraction({
        isButton: () => true,
        customId: 'cookies:delete',
        user: { id: 'random-user' },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Not authorized/);

    // admin can delete cookies
    cookiesManager.save(Buffer.from('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tabc\n'));
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'cookies:delete' }));
    await handler.handle(interaction);
    assert.strictEqual(cookiesManager.exists(), false);
    assert.strictEqual(calls.updates.length, 1);

    configManager.reset(GUILD);
    console.log('mock interaction check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
