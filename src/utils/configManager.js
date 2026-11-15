const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'guild-configs.json');

const DEFAULTS = Object.freeze({
    title: '🎧 Top4Top Audio Converter',
    description: 'Convert audio from YouTube, TikTok, SoundCloud, and Spotify into MP3 192 kbps and receive a direct Top4Top download link.',
    bannerUrl: null,
    thumbnailUrl: null,
    accentColor: '#3498db',
    footerText: 'Powered by Top4Top Converter',
    convertButtonLabel: 'Convert',
    convertButtonEmoji: '🎵',
    convertButtonStyle: 1,
    panelButtonLabel: 'Panel',
    panelButtonEmoji: 'ℹ️',
    panelButtonStyle: 2,
    panelChannelId: null,
    panelMessageId: null,
});

const EDITABLE = ['title', 'description', 'bannerUrl', 'thumbnailUrl', 'accentColor', 'footerText',
    'convertButtonLabel', 'convertButtonEmoji', 'convertButtonStyle',
    'panelButtonLabel', 'panelButtonEmoji', 'panelButtonStyle'];

function readAll() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return {};
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8').trim();
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
        console.error(`[config] Corrupted config file, starting fresh: ${err.message}`);
        return {};
    }
}

function writeAll(all) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
    fs.renameSync(tmp, CONFIG_PATH);
}

function str(value, field, min, max) {
    if (typeof value !== 'string') throw new Error(`${field} must be text.`);
    const v = value.trim();
    if (v.length < min || v.length > max) throw new Error(`${field} must be ${min}-${max} characters.`);
    return v;
}

function url(value, field) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new Error(`${field} must be a URL.`);
    let parsed;
    try { parsed = new URL(value.trim()); } catch { throw new Error(`${field} is not a valid URL.`); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`${field} must use http or https.`);
    if (value.length > 512) throw new Error(`${field} is too long.`);
    return value.trim();
}

const VALIDATORS = {
    title: v => str(v, 'Title', 1, 100),
    description: v => str(v, 'Description', 1, 2000),
    footerText: v => (typeof v === 'string' ? v.trim().slice(0, 200) : ''),
    bannerUrl: v => url(v, 'Banner URL'),
    thumbnailUrl: v => url(v, 'Thumbnail URL'),
    accentColor: v => {
        const hex = String(v || '').trim().replace(/^#/, '');
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error('Accent color must be a hex value like #3498db.');
        return `#${hex.toLowerCase()}`;
    },
    convertButtonLabel: v => str(v, 'Convert button label', 1, 80),
    panelButtonLabel: v => str(v, 'Panel button label', 1, 80),
    convertButtonEmoji: v => (typeof v === 'string' ? v.trim().slice(0, 32) : ''),
    panelButtonEmoji: v => (typeof v === 'string' ? v.trim().slice(0, 32) : ''),
    convertButtonStyle: v => style(v, 'Convert button style'),
    panelButtonStyle: v => style(v, 'Panel button style'),
};

function style(v, field) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`${field} must be 1-4 (1 Primary, 2 Secondary, 3 Success, 4 Danger).`);
    return n;
}

function get(guildId) {
    const all = readAll();
    return { ...DEFAULTS, ...(all[guildId] || {}) };
}

function set(guildId, patch) {
    const clean = {};
    for (const key of EDITABLE) {
        if (patch[key] === undefined) continue;
        clean[key] = VALIDATORS[key](patch[key]);
    }
    if (Object.keys(clean).length === 0) return get(guildId);
    const all = readAll();
    all[guildId] = { ...DEFAULTS, ...(all[guildId] || {}), ...clean };
    writeAll(all);
    return all[guildId];
}

function setDeployment(guildId, channelId, messageId) {
    const all = readAll();
    all[guildId] = { ...DEFAULTS, ...(all[guildId] || {}), panelChannelId: channelId || null, panelMessageId: messageId || null };
    writeAll(all);
    return all[guildId];
}

function reset(guildId) {
    const all = readAll();
    delete all[guildId];
    writeAll(all);
    return { ...DEFAULTS };
}

module.exports = { DEFAULTS, get, set, setDeployment, reset };
