const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');
const emoji = require('./emoji');

const PANEL_FLAGS = MessageFlags.IsComponentsV2;

const STYLES = {
    1: ButtonStyle.Primary,
    2: ButtonStyle.Secondary,
    3: ButtonStyle.Success,
    4: ButtonStyle.Danger,
};

function accent(config) {
    return parseInt(String(config.accentColor || '#3498db').replace('#', ''), 16) || 0x3498db;
}

function safeEmoji(button, emoji) {
    if (!emoji) return button;
    try { return button.setEmoji(emoji); } catch { return button; }
}

function imageGallery(config) {
    const items = [];
    if (config.bannerUrl) items.push(new MediaGalleryItemBuilder().setURL(config.bannerUrl).setDescription('Panel banner'));
    if (config.thumbnailUrl) items.push(new MediaGalleryItemBuilder().setURL(config.thumbnailUrl).setDescription('Panel thumbnail'));
    if (items.length === 0) return null;
    const gallery = new MediaGalleryBuilder();
    for (const item of items) gallery.addItems(item);
    return gallery;
}

function publicButtons(config) {
    const convert = safeEmoji(
        new ButtonBuilder()
            .setCustomId('panel:convert')
            .setLabel(config.convertButtonLabel || 'Convert')
            .setStyle(STYLES[config.convertButtonStyle] || ButtonStyle.Primary),
        config.convertButtonEmoji,
    );
    const info = safeEmoji(
        new ButtonBuilder()
            .setCustomId('panel:info')
            .setLabel(config.panelButtonLabel || 'Panel')
            .setStyle(STYLES[config.panelButtonStyle] || ButtonStyle.Secondary),
        config.panelButtonEmoji,
    );
    return new ActionRowBuilder().addComponents(convert, info);
}

function buildPanel(config) {
    const container = new ContainerBuilder().setAccentColor(accent(config));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${config.title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const gallery = imageGallery(config);
    if (gallery) {
        container.addMediaGalleryComponents(gallery);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.description));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**Supported platforms:** YouTube • TikTok • SoundCloud • Spotify\n' +
        'Press **Convert**, paste a link, and receive a direct MP3 192 kbps download link.',
    ));
    if (config.footerText) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${config.footerText}`));
    }
    container.addActionRowComponents(publicButtons(config));
    return container;
}

function panelPayload(config) {
    return { flags: PANEL_FLAGS, components: [buildPanel(config)] };
}

function infoPayload(config) {
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ℹ️ Converter Information'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '**How it works**\n' +
            '1. Click **Convert**.\n' +
            '2. Paste a YouTube, TikTok, SoundCloud, or Spotify link.\n' +
            '3. The bot extracts the audio, converts it to MP3 192 kbps, and uploads it to Top4Top.\n' +
            '4. A direct download link is returned.\n\n' +
            '**Supported platforms**\n' +
            '• **YouTube** — direct extraction\n' +
            '• **TikTok** — video audio extraction\n' +
            '• **SoundCloud** — progressive/HLS audio\n' +
            '• **Spotify** — metadata resolution + YouTube fallback\n\n' +
            '**Notes**\n' +
            '• Spotify streams are DRM protected, so matching audio is fetched elsewhere.\n' +
            '• Large files may take a while; status updates appear in the reply.',
        ));

    if (config.footerText) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${config.footerText}`));
    }
    return { flags: PANEL_FLAGS, components: [container] };
}

const CATEGORIES = {
    general: { label: 'General', description: 'Title, description, footer', fields: ['title', 'description', 'footerText'] },
    appearance: { label: 'Appearance', description: 'Colors, button labels, emojis, styles', fields: ['accentColor', 'convertButtonLabel', 'convertButtonEmoji', 'convertButtonStyle', 'panelButtonLabel', 'panelButtonEmoji', 'panelButtonStyle'] },
    images: { label: 'Images', description: 'Banner and thumbnail URLs', fields: ['bannerUrl', 'thumbnailUrl'] },
    manage: { label: 'Panel Management', description: 'Preview, deploy, reset, yt-dlp', fields: [] },
};

const FIELD_LABELS = {
    title: 'Title',
    description: 'Description',
    footerText: 'Footer',
    accentColor: 'Accent color',
    convertButtonLabel: 'Convert label',
    convertButtonEmoji: 'Convert emoji',
    convertButtonStyle: 'Convert style',
    panelButtonLabel: 'Panel label',
    panelButtonEmoji: 'Panel emoji',
    panelButtonStyle: 'Panel style',
    bannerUrl: 'Banner URL',
    thumbnailUrl: 'Thumbnail URL',
};

function dashboardPayload(config, category = 'general') {
    const cat = CATEGORIES[category] || CATEGORIES.general;
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚙️ Converter Setup Dashboard'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Title:** ${config.title}\n` +
            `**Accent:** \`${config.accentColor}\`\n` +
            `**Banner:** ${config.bannerUrl ? 'set' : 'not set'} • **Thumbnail:** ${config.thumbnailUrl ? 'set' : 'not set'}\n` +
            `**Deployed panel:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : 'not deployed'}\n` +
            `**History channel:** ${config.historyChannelId ? `<#${config.historyChannelId}>` : 'not configured'}\n\n` +
            `**Section:** ${cat.label} — ${cat.description}`,
        ));

    const select = new StringSelectMenuBuilder()
        .setCustomId('setup:cat')
        .setPlaceholder('Choose a configuration section')
        .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({
            label: c.label,
            description: c.description.slice(0, 100),
            value,
            default: value === category,
        })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

    const buttons = cat.fields.map(key => new ButtonBuilder()
        .setCustomId(`setup:field:${key}`)
        .setLabel(FIELD_LABELS[key] || key)
        .setStyle(ButtonStyle.Secondary));

    if (category === 'appearance') {
        buttons.push(new ButtonBuilder().setCustomId('setup:emojis').setLabel('Emoji Settings').setStyle(ButtonStyle.Primary));
    }

    if (category === 'manage') {
        buttons.push(
            new ButtonBuilder().setCustomId('setup:preview').setLabel('Preview').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:deploy').setLabel('Deploy / Update').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('setup:channel').setLabel('History Channel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('setup:reset').setLabel('Reset').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('setup:ytdlp').setLabel('yt-dlp status').setStyle(ButtonStyle.Secondary),
        );
    }

    for (let i = 0; i < buttons.length; i += 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
    }

    return { flags: PANEL_FLAGS | MessageFlags.Ephemeral, components: [container] };
}

function fieldModal(config, key) {
    const modal = new ModalBuilder().setCustomId(`setup:modal:${key}`).setTitle(`Configure: ${FIELD_LABELS[key] || key}`);
    const current = config[key];
    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(FIELD_LABELS[key] || key)
        .setStyle(key === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(key !== 'footerText' && key !== 'bannerUrl' && key !== 'thumbnailUrl' && key !== 'convertButtonEmoji' && key !== 'panelButtonEmoji')
        .setMaxLength(key === 'description' ? 2000 : 512);
    if (current !== null && current !== undefined && current !== '') input.setValue(String(current));
    if (key === 'accentColor') input.setPlaceholder('#3498db');
    if (key.endsWith('ButtonStyle')) input.setPlaceholder('1 = Primary, 2 = Secondary, 3 = Success, 4 = Danger');
    if (key === 'convertButtonEmoji' || key === 'panelButtonEmoji') input.setPlaceholder('Leave empty to remove the emoji');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function channelSelectRow(customId, placeholder = 'Select a text channel') {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);
    return new ActionRowBuilder().addComponents(select);
}

// `/setup channel` dashboard: pick, save, update, disable the history channel.
function historyChannelPayload(config, { selectedId = null } = {}) {
    const active = config.historyChannelId;
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📥 Upload History Channel'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Active channel:** ${active ? `<#${active}>` : 'not configured'}\n` +
            `**Pending selection:** ${selectedId ? `<#${selectedId}>` : 'none'}\n\n` +
            'Every successful upload posts one message to the active channel. ' +
            'Uploads still work normally when no channel is configured.',
        ))
        .addActionRowComponents(channelSelectRow('setup:channel:select'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup:channel:save')
                .setLabel('Save')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!selectedId),
            new ButtonBuilder()
                .setCustomId('setup:channel:update')
                .setLabel('Update')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!active),
            new ButtonBuilder()
                .setCustomId('setup:channel:disable')
                .setLabel('Disable')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!active),
        ));
    return { flags: PANEL_FLAGS | MessageFlags.Ephemeral, components: [container] };
}

// Deploy flow step 1: choose the target channel.
function deploySelectPayload(config) {
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🚀 Deploy Panel'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Current panel:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : 'not deployed'}\n\n` +
            'Select the channel that should receive the converter panel, then confirm.',
        ))
        .addActionRowComponents(channelSelectRow('setup:deploy:select', 'Select the panel destination channel'));
    return { flags: PANEL_FLAGS | MessageFlags.Ephemeral, components: [container] };
}

// Deploy flow step 2: explicit confirmation before posting.
function deployConfirmPayload(config, channelId) {
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🚀 Confirm Deploy'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Destination:** <#${channelId}>\n` +
            `**Current panel:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : 'not deployed'}\n\n` +
            (config.panelChannelId === channelId
                ? 'This channel already holds the panel — the existing message will be updated in place.'
                : 'A new panel will be posted. Any panel in another channel is left untouched.'),
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`setup:deploy:confirm:${channelId}`).setLabel('Confirm Deploy').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('setup:deploy:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        ));
    return { flags: PANEL_FLAGS | MessageFlags.Ephemeral, components: [container] };
}

// Emoji settings dashboard with a live preview of the success layout.
function emojiSettingsPayload(config, client, { preview = null } = {}) {
    const current = { ...emoji.DEFAULTS, ...(config.emojis || {}), ...(preview || {}) };
    const row = key => `${emoji.LABELS[key]}: ${emoji.render(client, { emojis: current }, key)}  \`${current[key]}\``;
    const container = new ContainerBuilder()
        .setAccentColor(accent(config))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 😀 Emoji Settings'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            emoji.KEYS.map(row).join('\n') + '\n\n' +
            '**Preview**\n' +
            `${emoji.render(client, { emojis: current }, 'title')} **Title:** \`Song\`\n\n` +
            `${emoji.render(client, { emojis: current }, 'artist')} **Artist / Uploader:** \`Artist\`\n\n` +
            `${emoji.render(client, { emojis: current }, 'duration')} **Duration:** \`03:12\`\n\n` +
            `${emoji.render(client, { emojis: current }, 'size')} **Size:** \`4.20 MB\`\n\n` +
            `${emoji.render(client, { emojis: current }, 'link')} **Direct Download Link:**\nhttp://top4top.io/example.mp3\n\n` +
            `${emoji.render(client, { emojis: current }, 'success')} **Upload Success**`,
        ));

    const buttons = emoji.KEYS.map(key => new ButtonBuilder()
        .setCustomId(`setup:emoji:${key}`)
        .setLabel(emoji.LABELS[key])
        .setStyle(ButtonStyle.Secondary));

    for (let i = 0; i < buttons.length; i += 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup:emoji:save').setLabel('Save').setStyle(ButtonStyle.Success).setDisabled(!preview),
        new ButtonBuilder().setCustomId('setup:emoji:reset').setLabel('Reset to Default').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('setup:emoji:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ));

    return { flags: PANEL_FLAGS | MessageFlags.Ephemeral, components: [container] };
}

function emojiModal(key) {
    const modal = new ModalBuilder()
        .setCustomId(`setup:emoji:modal:${key}`)
        .setTitle(`Emoji: ${emoji.LABELS[key] || key}`);
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Unicode emoji or <:name:id> / <a:name:id>')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(64)
            .setPlaceholder(`${emoji.DEFAULTS[key]}  or  <:name:123456789012345678>`),
    ));
    return modal;
}

function notice(text, color = 0x3498db) {
    return {
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
    };
}

function cookiesPayload(status) {
    const body = status.exists
        ? `**Format:** ${status.formatOk ? `valid (${status.count} cookies)` : 'invalid'}\n` +
          `**Size:** ${(status.size / 1024).toFixed(1)} KB\n` +
          `**Updated:** <t:${Math.floor(status.modified.getTime() / 1000)}:R>\n` +
          `**Authentication:** \`${status.auth.state}\`${status.auth.detail ? ` — ${status.auth.detail}` : ''}`
        : '**Status:** no cookies.txt uploaded. Downloads run without cookies.';

    return {
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [new ContainerBuilder()
            .setAccentColor(status.exists ? 0x2ecc71 : 0x95a5a6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🍪 Global Cookies Manager'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                'Upload with `/setup cookies file:<cookies.txt>`.\n' +
                '-# Stored locally at data/secure/cookies.txt. Contents are never displayed or logged.',
            ))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cookies:validate').setLabel('Validate auth').setStyle(ButtonStyle.Primary).setEmoji('🔍').setDisabled(!status.exists),
                new ButtonBuilder().setCustomId('cookies:delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setDisabled(!status.exists),
            ))],
    };
}

module.exports = {
    PANEL_FLAGS, CATEGORIES, FIELD_LABELS, accent,
    buildPanel, panelPayload, infoPayload, dashboardPayload, fieldModal,
    notice, cookiesPayload,
    historyChannelPayload, deploySelectPayload, deployConfirmPayload,
    emojiSettingsPayload, emojiModal, channelSelectRow,
};
