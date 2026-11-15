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
const { runConversion, errorPayload } = require('../utils/convertFlow');
const { isCookieAdmin } = require('../commands/setup');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const { notice, cookiesPayload, dashboardPayload, CATEGORIES } = panelBuilder;

function isAdmin(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

function categoryFor(key) {
    if (CATEGORIES.general.fields.includes(key)) return 'general';
    if (CATEGORIES.images.fields.includes(key)) return 'images';
    if (CATEGORIES.appearance.fields.includes(key)) return 'appearance';
    return 'general';
}

async function deployPanel(interaction, guildId) {
    const config = configManager.get(guildId);
    const payload = panelBuilder.panelPayload(config);
    const channel = interaction.channel;

    if (config.panelMessageId) {
        try {
            const existing = await channel.messages.fetch(config.panelMessageId);
            await existing.edit(payload);
            return notice('## ✅ Panel updated\nExisting panel was updated in place.', 0x2ecc71);
        } catch {
            // Deleted or unreachable: deploy a fresh one below.
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
        await interaction.deferReply({ flags: EPHEMERAL_V2 });
        return interaction.editReply(await deployPanel(interaction, guildId));
    }

    if (action === 'reset') {
        configManager.reset(guildId);
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
        if (id.startsWith('setup:')) return handleSetupButton(interaction, guildId);
        if (id.startsWith('panel:')) return handlePanelButton(interaction, guildId);
        if (id.startsWith('cookies:')) return handleCookiesButton(interaction);
        return undefined;
    }

    if (interaction.isStringSelectMenu() && id === 'setup:cat') {
        if (!isAdmin(interaction)) return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
        return interaction.update(dashboardPayload(configManager.get(guildId), interaction.values[0]));
    }

    if (interaction.isModalSubmit()) {
        if (id.startsWith('setup:modal:')) return handleSetupModal(interaction, guildId);
        if (id === 'panel:convert:modal') return handleConvertModal(interaction, guildId);
        return undefined;
    }

    return undefined;
}

module.exports = { handle, isAdmin, isCookieAdmin };
