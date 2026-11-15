const {
    MessageFlags,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');
const configManager = require('../utils/configManager');
const panelBuilder = require('../utils/panelBuilder');
const cookiesManager = require('../utils/cookiesManager');
const ytdlpUpdater = require('../utils/ytdlpUpdater');
const emoji = require('../utils/emoji');
const { runConversion, errorPayload } = require('../utils/convertFlow');
const { isCookieAdmin } = require('../commands/setup');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const { notice, cookiesPayload, dashboardPayload, CATEGORIES } = panelBuilder;

// Pending selections live in memory only; a restart just means re-selecting.
const pendingChannel = new Map();
const pendingDeploy = new Map();
const emojiPreview = new Map();

function isAdmin(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

function categoryFor(key) {
    if (CATEGORIES.general.fields.includes(key)) return 'general';
    if (CATEGORIES.images.fields.includes(key)) return 'images';
    if (CATEGORIES.appearance.fields.includes(key)) return 'appearance';
    return 'general';
}

function canSend(channel, client) {
    const me = channel?.guild?.members?.me;
    if (!me) return true;
    const perms = channel.permissionsFor(me);
    return Boolean(perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages));
}

async function deployPanel(interaction, guildId, channelId) {
    const config = configManager.get(guildId);
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return notice('## ❌ Channel unavailable\nThe selected channel no longer exists or is not accessible.', 0xe74c3c);
    if (!canSend(channel, interaction.client)) {
        return notice('## ❌ Missing permissions\nI need **View Channel** and **Send Messages** in that channel.', 0xe74c3c);
    }

    const payload = panelBuilder.panelPayload(config);

    // Only reuse the stored message when deploying to the same channel.
    if (config.panelMessageId && config.panelChannelId === channelId) {
        const existing = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        if (existing) {
            await existing.edit(payload);
            return notice('## ✅ Panel updated\nThe existing panel was updated in place.', 0x2ecc71);
        }
    }

    const message = await channel.send(payload);
    configManager.setDeployment(guildId, channel.id, message.id);
    return notice(`## ✅ Panel deployed\nPanel posted in <#${channel.id}>.`, 0x2ecc71);
}

async function handleSetupButton(interaction, guildId) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));

    const [, action, field] = interaction.customId.split(':');

    if (action === 'preview') {
        return interaction.reply({ flags: EPHEMERAL_V2, components: [panelBuilder.buildPanel(configManager.get(guildId))] });
    }

    if (action === 'deploy') {
        return interaction.reply(panelBuilder.deploySelectPayload(configManager.get(guildId)));
    }

    if (action === 'channel') {
        return interaction.reply(panelBuilder.historyChannelPayload(configManager.get(guildId)));
    }

    if (action === 'reset') {
        configManager.reset(guildId);
        pendingChannel.delete(guildId);
        pendingDeploy.delete(guildId);
        emojiPreview.delete(guildId);
        return interaction.update(dashboardPayload(configManager.get(guildId), 'general'));
    }

    if (action === 'ytdlp') {
        await interaction.deferReply({ flags: EPHEMERAL_V2 });
        const before = await ytdlpUpdater.currentVersion();
        const result = await ytdlpUpdater.update({ force: true });
        const after = await ytdlpUpdater.currentVersion();
        const lines = [
            '## 🧩 yt-dlp Status',
            `**Before:** \`${before || 'unknown'}\``,
            `**Now:** \`${after || 'unknown'}\``,
            `**Last check:** ${ytdlpUpdater.lastCheckAt() ? `<t:${Math.floor(ytdlpUpdater.lastCheckAt() / 1000)}:R>` : 'never'}`,
            `**Result:** ${result.error ? `failed — ${result.error}` : result.changed ? 'updated' : 'already up to date'}`,
            '-# Automatic checks run at startup and every 24 hours.',
        ];
        return interaction.editReply(notice(lines.join('\n'), result.error ? 0xe67e22 : 0x2ecc71));
    }

    if (action === 'field' && field) {
        return interaction.showModal(panelBuilder.fieldModal(configManager.get(guildId), field));
    }

    if (action === 'emojis') {
        return interaction.reply(panelBuilder.emojiSettingsPayload(configManager.get(guildId), interaction.client));
    }

    return interaction.update(dashboardPayload(configManager.get(guildId), 'general'));
}

async function handleSetupModal(interaction, guildId) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
    const key = interaction.customId.split(':')[2];
    try {
        configManager.set(guildId, { [key]: interaction.fields.getTextInputValue('value') });
    } catch (err) {
        return interaction.reply(notice(`## ❌ Invalid value\n${err.message}`, 0xe74c3c));
    }
    return interaction.reply(dashboardPayload(configManager.get(guildId), categoryFor(key)));
}

async function handlePanelButton(interaction, guildId) {
    if (interaction.customId === 'panel:info') {
        return interaction.reply(panelBuilder.infoPayload(configManager.get(guildId)));
    }

    return interaction.showModal(new ModalBuilder()
        .setCustomId('panel:convert:modal')
        .setTitle('Convert Audio')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('url')
                .setLabel('Audio URL')
                .setPlaceholder('YouTube, TikTok, SoundCloud, or Spotify link')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2048),
        )));
}

async function handleConvertModal(interaction, guildId) {
    const url = interaction.fields.getTextInputValue('url');
    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
    try {
        await runConversion(interaction, url, { accentColor: panelBuilder.accent(configManager.get(guildId)) });
    } catch (error) {
        console.error(error);
        await interaction.editReply(errorPayload(error.message));
    }
}

// /setup channel: select, save, update, disable.
async function handleChannelSelect(interaction, guildId) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
    const channelId = interaction.values[0];
    pendingChannel.set(guildId, channelId);
    return interaction.update(panelBuilder.historyChannelPayload(configManager.get(guildId), { selectedId: channelId }));
}

async function handleChannelButton(interaction, guildId, action) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));

    if (action === 'disable') {
        configManager.setHistoryChannel(guildId, null);
        pendingChannel.delete(guildId);
        return interaction.update(panelBuilder.historyChannelPayload(configManager.get(guildId)));
    }

    const selected = pendingChannel.get(guildId) || configManager.get(guildId).historyChannelId;
    if (!selected) return interaction.reply(notice('## ❌ No channel selected\nPick a channel from the menu first.', 0xe74c3c));

    const channel = await interaction.client.channels.fetch(selected).catch(() => null);
    if (!channel) return interaction.reply(notice('## ❌ Channel unavailable\nThe selected channel no longer exists.', 0xe74c3c));
    if (!canSend(channel, interaction.client)) {
        return interaction.reply(notice('## ❌ Missing permissions\nI need **View Channel** and **Send Messages** in that channel.', 0xe74c3c));
    }

    configManager.setHistoryChannel(guildId, selected);
    pendingChannel.delete(guildId);
    return interaction.update(panelBuilder.historyChannelPayload(configManager.get(guildId)));
}

// Deploy flow: select -> confirm -> post.
async function handleDeploySelect(interaction, guildId) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
    const channelId = interaction.values[0];
    pendingDeploy.set(guildId, channelId);
    return interaction.update(panelBuilder.deployConfirmPayload(configManager.get(guildId), channelId));
}

async function handleDeployButton(interaction, guildId, action, channelId) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));

    if (action === 'cancel') {
        pendingDeploy.delete(guildId);
        return interaction.update(dashboardPayload(configManager.get(guildId), 'manage'));
    }

    const target = channelId || pendingDeploy.get(guildId);
    if (!target) return interaction.reply(notice('## ❌ No channel selected\nStart the deploy flow again.', 0xe74c3c));

    await interaction.deferUpdate();
    pendingDeploy.delete(guildId);
    const result = await deployPanel(interaction, guildId, target);
    return interaction.editReply(result);
}

// Emoji settings: per-key modal, preview, save, reset.
async function handleEmojiButton(interaction, guildId, action, key) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));

    if (key) return interaction.showModal(panelBuilder.emojiModal(key));

    if (action === 'back') {
        emojiPreview.delete(guildId);
        return interaction.update(dashboardPayload(configManager.get(guildId), 'appearance'));
    }

    if (action === 'reset') {
        emojiPreview.delete(guildId);
        configManager.setEmojis(guildId, { ...emoji.DEFAULTS });
        return interaction.update(panelBuilder.emojiSettingsPayload(configManager.get(guildId), interaction.client));
    }

    if (action === 'save') {
        const preview = emojiPreview.get(guildId);
        if (!preview) return interaction.reply(notice('## ❌ Nothing to save\nChange an emoji first.', 0xe74c3c));
        try {
            configManager.setEmojis(guildId, preview);
        } catch (err) {
            return interaction.reply(notice(`## ❌ Invalid emoji\n${err.message}`, 0xe74c3c));
        }
        emojiPreview.delete(guildId);
        return interaction.update(panelBuilder.emojiSettingsPayload(configManager.get(guildId), interaction.client));
    }

    return interaction.update(panelBuilder.emojiSettingsPayload(configManager.get(guildId), interaction.client));
}

async function handleEmojiModal(interaction, guildId, key) {
    if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
    const value = interaction.fields.getTextInputValue('value');
    let normalized;
    try {
        normalized = emoji.normalizeValue(value, key);
    } catch (err) {
        return interaction.reply(notice(`## ❌ Invalid emoji\n${err.message}`, 0xe74c3c));
    }
    const preview = { ...(emojiPreview.get(guildId) || {}), [key]: normalized };
    emojiPreview.set(guildId, preview);
    return interaction.reply(panelBuilder.emojiSettingsPayload(configManager.get(guildId), interaction.client, { preview }));
}

async function handleCookiesButton(interaction) {
    if (!isCookieAdmin(interaction)) return interaction.reply(notice('## 🔒 Not authorized', 0xe74c3c));

    if (interaction.customId === 'cookies:delete') {
        cookiesManager.remove();
        return interaction.update(cookiesPayload(cookiesManager.status()));
    }

    await interaction.deferReply({ flags: EPHEMERAL_V2 });
    const auth = await cookiesManager.validateAuth();
    const color = auth.state === 'auth_ok' ? 0x2ecc71 : auth.state === 'missing' ? 0x95a5a6 : 0xe67e22;
    return interaction.editReply(notice(
        `## 🔍 Cookies Authentication\n**Result:** \`${auth.state}\`\n${auth.detail || ''}\n\n` +
        '-# A syntactically valid file is not proof of valid authentication.',
        color,
    ));
}

async function handle(interaction) {
    const id = interaction.customId || '';
    const guildId = interaction.guildId;

    if (interaction.isButton()) {
        if (id.startsWith('setup:channel:')) return handleChannelButton(interaction, guildId, id.split(':')[2]);
        if (id.startsWith('setup:deploy:')) {
            const [, , action, channelId] = id.split(':');
            return handleDeployButton(interaction, guildId, action, channelId);
        }
        if (id.startsWith('setup:emoji:')) {
            const [, , action, key] = id.split(':');
            // `setup:emoji:<key>` opens the key modal; `setup:emoji:<action>` runs the action.
            if (emoji.KEYS.includes(action)) return handleEmojiButton(interaction, guildId, null, action);
            return handleEmojiButton(interaction, guildId, action, key);
        }
        if (id.startsWith('setup:')) return handleSetupButton(interaction, guildId);
        if (id.startsWith('panel:')) return handlePanelButton(interaction, guildId);
        if (id.startsWith('cookies:')) return handleCookiesButton(interaction);
        return undefined;
    }

    if (interaction.isChannelSelectMenu()) {
        if (id === 'setup:channel:select') return handleChannelSelect(interaction, guildId);
        if (id === 'setup:deploy:select') return handleDeploySelect(interaction, guildId);
        return undefined;
    }

    if (interaction.isStringSelectMenu() && id === 'setup:cat') {
        if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
        return interaction.update(dashboardPayload(configManager.get(guildId), interaction.values[0]));
    }

    if (interaction.isModalSubmit()) {
        if (id.startsWith('setup:emoji:modal:')) return handleEmojiModal(interaction, guildId, id.split(':')[3]);
        if (id.startsWith('setup:modal:')) return handleSetupModal(interaction, guildId);
        if (id === 'panel:convert:modal') return handleConvertModal(interaction, guildId);
        return undefined;
    }

    return undefined;
}

module.exports = { handle, isAdmin, isCookieAdmin };
