const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const MusicDownloader = require('../utils/downloader');
const Top4TopUploader = require('../utils/uploader');

const SUPPORTED = /^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|tiktok\.com|soundcloud\.com|spotify\.com)\//i;

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

// Shared pipeline: /upload and the public panel Convert button both land here.
async function runConversion(interaction, rawUrl, { accentColor = 0x3498db } = {}) {
    const url = validateUrl(rawUrl);

    const processing = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⏳ Processing Audio Request'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Target URL:**\n> ${url}\n\n` +
            '🔎 **Status:** Searching metadata & resolving audio stream...\n' +
            '📡 **Connection:** Connecting to media servers...',
        ));
    await interaction.editReply({ components: [processing] });

    const { filePath, title, duration, uploader, fileSize, thumbnail } = await MusicDownloader.downloadAudio(url);

    const sizeMb = fileSize ? (fileSize / (1024 * 1024)).toFixed(2) : 0;
    const sizeStr = sizeMb > 0 ? `${sizeMb} MB` : 'Unknown';
    const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;

    const uploading = new ContainerBuilder()
        .setAccentColor(0xe67e22)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📤 Uploading to Top4Top'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    media(uploading, thumbnail, `${title} - ${uploader}`);
    uploading.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**🎵 Title:** \`${title}\`\n` +
        `**👤 Artist / Uploader:** \`${uploader}\`\n` +
        `**⏱️ Duration:** \`${durationStr}\`\n` +
        `**📦 File Size:** \`${sizeStr}\`\n\n` +
        '🚀 **Status:** Converting to MP3 and uploading to Top4Top servers...',
    ));
    await interaction.editReply({ components: [uploading] });

    let downloadLink;
    try {
        downloadLink = await Top4TopUploader.uploadFile(filePath);
    } finally {
        MusicDownloader.cleanupFile(filePath);
    }

    const success = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Audio Upload Successful!'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    media(success, thumbnail, `${title} - ${uploader}`);
    success
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**🎵 Title:** \`${title}\`\n` +
            `**👤 Artist / Uploader:** \`${uploader}\`\n` +
            `**⏱️ Duration:** \`${durationStr}\`\n` +
            `**📦 Size:** \`${sizeStr}\`\n\n` +
            `🔗 **Direct Download Link:** [Top4Top Direct Link](${downloadLink})\n` +
            '-# Uploaded via Top4Top Converter Bot • Components V2',
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Download Audio File')
                .setStyle(ButtonStyle.Link)
                .setURL(downloadLink)
                .setEmoji('🔗'),
        ));

    await interaction.editReply({ components: [success] });
}

function errorPayload(message, accentColor = 0xe74c3c) {
    return {
        components: [new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Processing Failed'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `An error occurred while processing the request:\n\`\`\`\n${String(message).slice(0, 1500)}\n\`\`\``,
            ))],
    };
}

module.exports = { runConversion, validateUrl, errorPayload, SUPPORTED };
