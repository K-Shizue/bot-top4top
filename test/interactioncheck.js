const assert = require('assert');
process.env.COOKIE_ADMIN_IDS = 'admin-1';

const handler = require('../src/handlers/interactionHandler');
const configManager = require('../src/utils/configManager');
const cookiesManager = require('../src/utils/cookiesManager');

const GUILD = 'mock-guild';

function makeChannel(id, state = {}) {
    const sent = state.sent || [];
    return {
        id,
        guild: { members: { me: { id: 'bot' } } },
        permissionsFor: () => ({ has: () => state.allowSend !== false }),
        send: async p => { sent.push(p); return { id: `msg-${id}` }; },
        messages: {
            fetch: async msgId => {
                const existing = state.existing && state.existing[msgId];
                if (!existing) throw new Error('Unknown Message');
                return { edit: async p => { state.edited = state.edited || []; state.edited.push(p); } };
            },
        },
    };
}

function mockInteraction(overrides = {}, channelState = {}) {
    const calls = { replies: [], updates: [], edits: [], modals: [], defers: [] };
    const channels = new Map();
    const baseChannel = makeChannel('chan-1', channelState);
    channels.set('chan-1', baseChannel);
    channels.set('chan-2', makeChannel('chan-2', channelState));
    const emojis = new Map([['123456789012345678', { id: '123456789012345678' }]]);

    const interaction = {
        guildId: GUILD,
        user: { id: 'admin-1', username: 'admin' },
        client: {
            application: { owner: { ownerId: 'owner-1' } },
            channels: { fetch: async id => channels.get(id) || null },
            emojis: { cache: { get: id => emojis.get(id) } },
        },
        memberPermissions: { has: () => true },
        deferred: false,
        replied: false,
        customId: '',
        values: [],
        isButton: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isModalSubmit: () => false,
        reply: async p => { calls.replies.push(p); interaction.replied = true; },
        update: async p => { calls.updates.push(p); interaction.replied = true; },
        editReply: async p => { calls.edits.push(p); },
        followUp: async p => { calls.replies.push(p); },
        deferReply: async opts => { interaction.deferred = true; calls.defers.push(opts || {}); },
        deferUpdate: async () => { interaction.deferred = true; },
        showModal: async m => { calls.modals.push(m); },
        channel: baseChannel,
        fields: { getTextInputValue: () => 'value' },
        ...overrides,
    };
    return { interaction, calls, channelState };
}

(async () => {
    // --- preview ---
    let { interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:preview' });
    await handler.handle(interaction);
    assert.strictEqual(calls.replies.length, 1);
    assert.strictEqual(calls.replies[0].flags, 32768 | 64);

    // --- field modal ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:field:title' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.modals[0].data.custom_id, 'setup:modal:title');

    // --- modal saves config ---
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:modal:title',
        fields: { getTextInputValue: () => 'Guild Panel Title' },
    }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).title, 'Guild Panel Title');

    // --- invalid modal rejected ---
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:modal:accentColor',
        fields: { getTextInputValue: () => 'nope' },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Invalid value/);
    assert.strictEqual(configManager.get(GUILD).accentColor, configManager.DEFAULTS.accentColor);

    // --- category switch ---
    ({ interaction, calls } = mockInteraction({ isStringSelectMenu: () => true, customId: 'setup:cat', values: ['manage'] }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.updates[0]), /Panel Management/);

    // --- deploy step 1: opens channel select, sends nothing ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:deploy' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.replies.length, 1);
    assert.match(JSON.stringify(calls.replies[0]), /Select the panel destination channel/);
    assert.strictEqual(configManager.get(GUILD).panelMessageId, null, 'deploy must wait for confirmation');

    // --- deploy step 2: channel select shows confirmation ---
    ({ interaction, calls } = mockInteraction({ isChannelSelectMenu: () => true, customId: 'setup:deploy:select', values: ['chan-2'] }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.updates[0]), /Confirm Deploy/);
    assert.match(JSON.stringify(calls.updates[0]), /chan-2/);

    // --- deploy step 3: confirm posts once and persists ids ---
    const deployState = { sent: [] };
    ({ interaction, calls } = mockInteraction(
        { isButton: () => true, customId: 'setup:deploy:confirm:chan-2' },
        deployState,
    ));
    await handler.handle(interaction);
    assert.strictEqual(deployState.sent.length, 1, 'panel sent exactly once');
    assert.strictEqual(configManager.get(GUILD).panelChannelId, 'chan-2');
    assert.strictEqual(configManager.get(GUILD).panelMessageId, 'msg-chan-2');
    assert.strictEqual(calls.edits.length, 1, 'one deferred edit result');

    // --- deploy again to same channel: edits stored message, no duplicate ---
    const sameState = { sent: [], existing: { 'msg-chan-2': true } };
    ({ interaction, calls } = mockInteraction(
        { isButton: () => true, customId: 'setup:deploy:confirm:chan-2' },
        sameState,
    ));
    await handler.handle(interaction);
    assert.strictEqual(sameState.sent.length, 0, 'must not create a duplicate panel');
    assert.strictEqual(sameState.edited.length, 1, 'existing panel edited in place');

    // --- deploy to a different channel: posts new, old panel untouched ---
    const otherState = { sent: [] };
    ({ interaction, calls } = mockInteraction(
        { isButton: () => true, customId: 'setup:deploy:confirm:chan-1' },
        otherState,
    ));
    await handler.handle(interaction);
    assert.strictEqual(otherState.sent.length, 1);
    assert.strictEqual(otherState.edited, undefined, 'previous panel must not be edited');
    assert.strictEqual(configManager.get(GUILD).panelChannelId, 'chan-1');

    // --- deploy blocked when bot cannot send ---
    const noPermState = { sent: [], allowSend: false };
    ({ interaction, calls } = mockInteraction(
        { isButton: () => true, customId: 'setup:deploy:confirm:chan-2' },
        noPermState,
    ));
    await handler.handle(interaction);
    assert.strictEqual(noPermState.sent.length, 0);
    assert.match(JSON.stringify(calls.edits[0]), /Missing permissions/);

    // --- deploy cancel returns to dashboard ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:deploy:cancel' }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.updates[0]), /Panel Management/);

    // --- reset still works ---
    configManager.set(GUILD, { title: 'Temp' });
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:reset' }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).title, configManager.DEFAULTS.title);
    assert.match(JSON.stringify(calls.updates[0]), /Converter Setup Dashboard/);

    // --- history channel: select -> save ---
    ({ interaction, calls } = mockInteraction({ isChannelSelectMenu: () => true, customId: 'setup:channel:select', values: ['chan-2'] }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.updates[0]), /Pending selection/);

    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:channel:save' }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).historyChannelId, 'chan-2');

    // --- history channel: disable ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:channel:disable' }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).historyChannelId, null);

    // --- history channel blocked without permission ---
    ({ interaction, calls } = mockInteraction({ isChannelSelectMenu: () => true, customId: 'setup:channel:select', values: ['chan-2'] }));
    await handler.handle(interaction);
    ({ interaction, calls } = mockInteraction(
        { isButton: () => true, customId: 'setup:channel:save' },
        { allowSend: false },
    ));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Missing permissions/);

    // --- emoji settings opens ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:emojis' }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Emoji Settings/);

    // --- emoji key opens modal ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:emoji:title' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.modals[0].data.custom_id, 'setup:emoji:modal:title');

    // --- emoji modal shows preview, then save persists ---
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:emoji:modal:title',
        fields: { getTextInputValue: () => '✨' },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Preview/);

    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:emoji:save' }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).emojis.title, '✨');

    // --- emoji reset restores defaults ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'setup:emoji:reset' }));
    await handler.handle(interaction);
    assert.strictEqual(configManager.get(GUILD).emojis.title, configManager.DEFAULTS.emojis.title);

    // --- invalid emoji rejected ---
    ({ interaction, calls } = mockInteraction({
        isModalSubmit: () => true,
        customId: 'setup:emoji:modal:title',
        fields: { getTextInputValue: () => '<:broken:notanid>' },
    }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Invalid emoji/);

    // --- panel: info ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'panel:info' }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Converter Information/);

    // --- panel: convert -> modal ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'panel:convert' }));
    await handler.handle(interaction);
    assert.strictEqual(calls.modals[0].data.custom_id, 'panel:convert:modal');

    // --- non-admin blocked everywhere ---
    for (const customId of ['setup:reset', 'setup:deploy', 'setup:channel:save', 'setup:emoji:save']) {
        ({ interaction, calls } = mockInteraction({
            isButton: () => true,
            customId,
            memberPermissions: { has: () => false },
        }));
        await handler.handle(interaction);
        assert.match(JSON.stringify(calls.replies[0]), /Manage Server permission required/, customId);
    }

    // --- cookies unchanged ---
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'cookies:delete', user: { id: 'random-user' } }));
    await handler.handle(interaction);
    assert.match(JSON.stringify(calls.replies[0]), /Not authorized/);

    cookiesManager.save(Buffer.from('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tabc\n'));
    ({ interaction, calls } = mockInteraction({ isButton: () => true, customId: 'cookies:delete' }));
    await handler.handle(interaction);
    assert.strictEqual(cookiesManager.exists(), false);

    configManager.reset(GUILD);
    console.log('mock interaction check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
