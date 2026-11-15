const { ActivityType } = require('discord.js');

const PRESENCE_NAME = 'Bot convert by KEJU';

function streamingUrl() {
    const raw = (process.env.STREAMING_URL || '').trim();
    if (!raw) {
        console.warn('[presence] STREAMING_URL is not set. Streaming presence will be skipped. Add e.g. STREAMING_URL=https://www.twitch.tv/your_channel to .env');
        return null;
    }
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol must be http or https');
        return raw;
    } catch (err) {
        console.warn(`[presence] STREAMING_URL is invalid (${err.message}). Streaming presence will be skipped. Expected a full URL such as https://www.twitch.tv/your_channel`);
        return null;
    }
}

// setPresence is idempotent, so re-applying after a reconnect is safe.
function applyPresence(client) {
    const url = streamingUrl();
    if (!url || !client?.user?.setPresence) return false;
    client.user.setPresence({
        activities: [{ name: PRESENCE_NAME, type: ActivityType.Streaming, url }],
        status: 'online',
    });
    return true;
}

module.exports = { PRESENCE_NAME, streamingUrl, applyPresence };
