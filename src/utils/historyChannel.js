// Posts one history message per successful upload. Never throws into the upload path.
const configManager = require('./configManager');
const uploadHistory = require('./uploadHistory');
const emoji = require('./emoji');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const V2 = MessageFlags.IsComponentsV2;

function historyPayload(entry, client) {
    const config = entry.guildId ? configManager.get(entry.guildId) : null;
    const e = key => emoji.render(client, config, key);
    const container = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${e('success')} **${entry.title} - ${entry.artist}**\n\n` +
            `${e('link')} **Top4Top Direct Link:**\n${entry.url}\n\n` +
            `${e('artist')} **Uploaded by:** <@${entry.userId}>`,
        ));
    return { flags: V2, components: [container], allowedMentions: { parse: [] } };
}

async function post(client, entry) {
    if (!entry?.guildId) return { posted: false, reason: 'no_guild' };
    const config = configManager.get(entry.guildId);
    if (!config.historyChannelId) return { posted: false, reason: 'not_configured' };

    const channel = await client.channels.fetch(config.historyChannelId).catch(() => null);
    if (!channel) return { posted: false, reason: 'channel_missing' };

    const me = channel.guild?.members?.me;
    if (me && !channel.permissionsFor(me)?.has('SendMessages')) {
        console.warn(`[history] Missing SendMessages in channel ${config.historyChannelId}`);
        return { posted: false, reason: 'no_permission' };
    }

    try {
        await channel.send(historyPayload(entry, client));
        return { posted: true };
    } catch (err) {
        console.error(`[history] Failed to post history message: ${err.message}`);
        return { posted: false, reason: 'send_failed' };
    }
}

// Records then posts; both steps are best-effort relative to the upload.
async function recordAndPost(client, entry) {
    let saved;
    try {
        saved = await uploadHistory.add(entry);
    } catch (err) {
        console.error(`[history] Failed to save history record: ${err.message}`);
        return { saved: false, posted: false };
    }
    const result = await post(client, saved).catch(err => {
        console.error(`[history] Failed to post history message: ${err.message}`);
        return { posted: false, reason: 'send_failed' };
    });
    return { saved: true, ...result };
}

module.exports = { historyPayload, post, recordAndPost };
