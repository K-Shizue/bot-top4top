const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
} = require('discord.js');
const MusicDownloader = require('../utils/downloader');
const Top4TopUploader = require('../utils/uploader');
const configManager = require('./configManager');
const emoji = require('./emoji');
const historyChannel = require('./historyChannel');

const SUPPORTED = /^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|tiktok\.com|soundcloud\.com|spotify\.com)\//i;

// Discord validates an edit payload against the flags carried by that payload,
// so every V2 payload must restate IsComponentsV2, not just the initial defer.
function v2(components) {
    return { flags: MessageFlags.IsComponentsV2, components };
}

function validateUrl(url) {
    if (typeof url !== 'string' || !url.trim()) throw new Error('Please provide an audio URL.');
    const value = url.trim();
    if (value.length > 2048) throw new Error('URL is too long.');
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('That is not a valid URL.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('URL must use http or https.');
    if (!SUPPORTED.test(value)) throw new Error('Unsupported platform. Use YouTube, TikTok, SoundCloud, or Spotify.');
    return value;
}

function media(container, thumbnail, description) {
    if (!thumbnail) return container;
    return container
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(thumbnail).setDescription(description),
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

function formatDuration(duration) {
    const total = Number(duration) || 0;
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSize(fileSize) {
    const mb = (Number(fileSize) || 0) / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
}

// Success layout is shared by the reply and the history channel.
// Accent is intentionally white; the link stays raw text so it can be copied.
function successContainer({ title, artist, duration, fileSize, url }, e) {
    return new ContainerBuilder()
        .setAccentColor(0xffffff)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${e('title')} **Title:** \`${title}\`\n\n` +
            `${e('artist')} **Artist / Uploader:** \`${artist}\`\n\n` +
            `${e('duration')} **Duration:** \`${formatDuration(duration)}\`\n\n` +
            `${e('size')} **Size:** \`${formatSize(fileSize)}\`\n\n` +
            `${e('link')} **Direct Download Link:**\n${url}\n\n` +
            'Uploaded via Mila Bot',
        ));
}

// Shared pipeline: /upload and the public panel Convert button both land here.
async function runConversion(interaction, rawUrl, { accentColor = 0x3498db } = {}) {
    const url = validateUrl(rawUrl);
    const guildId = interaction.guildId || null;
    const config = guildId ? configManager.get(guildId) : null;
    const e = key => emoji.render(interaction.client, config, key);

    const processing = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⏳ Processing Audio Request'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Target URL:**\n> ${url}\n\n` +
            '🔎 **Status:** Searching metadata & resolving audio stream...\n' +
            '📡 **Connection:** Connecting to media servers...',
        ));
    await interaction.editReply(v2([processing]));

    const { filePath, title, duration, uploader, fileSize, thumbnail } = await MusicDownloader.downloadAudio(url);

    const uploading = new ContainerBuilder()
        .setAccentColor(0xe67e22)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📤 Uploading to Top4Top'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    media(uploading, thumbnail, `${title} - ${uploader}`);
    uploading.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${e('title')} **Title:** \`${title}\`\n` +
        `${e('artist')} **Artist / Uploader:** \`${uploader}\`\n` +
        `${e('duration')} **Duration:** \`${formatDuration(duration)}\`\n` +
        `${e('size')} **File Size:** \`${formatSize(fileSize)}\`\n\n` +
        '🚀 **Status:** Converting to MP3 and uploading to Top4Top servers...',
    ));
    await interaction.editReply(v2([uploading]));

    let downloadLink;
    try {
        downloadLink = await Top4TopUploader.uploadFile(filePath);
    } finally {
        MusicDownloader.cleanupFile(filePath);
    }

    // Record before the final reply: the upload already succeeded, so history must not
    // be lost just because the Discord reply fails. Both steps are best-effort.
    await historyChannel.recordAndPost(interaction.client, {
        title,
        artist: uploader,
        duration,
        fileSize,
        url: downloadLink,
        userId: interaction.user?.id,
        username: interaction.user?.username,
        guildId,
    }).catch(err => console.error(`[history] ${err.message}`));

    await interaction.editReply(v2([successContainer({ title, artist: uploader, duration, fileSize, url: downloadLink }, e)]));
}

function errorPayload(message, accentColor = 0xe74c3c) {
    return v2([new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Processing Failed'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `An error occurred while processing the request:\n\`\`\`\n${String(message).slice(0, 1500)}\n\`\`\``,
        ))]);
}

module.exports = {
    runConversion, validateUrl, errorPayload, SUPPORTED, v2,
    successContainer, formatDuration, formatSize,
};
