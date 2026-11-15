// Emoji settings: stored as Discord emoji markup or Unicode, rendered with a Unicode fallback.
const CUSTOM = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,25})>$/;

const DEFAULTS = Object.freeze({
    title: '🎵',
    artist: '👤',
    duration: '⏱️',
    size: '📦',
    link: '🔗',
    success: '✅',
});

const KEYS = Object.keys(DEFAULTS);

const LABELS = {
    title: 'Title',
    artist: 'Artist / Uploader',
    duration: 'Duration',
    size: 'File Size',
    link: 'Direct Download Link',
    success: 'Upload Success',
};

function parse(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    const custom = raw.match(CUSTOM);
    if (custom) return { kind: 'custom', animated: custom[1] === 'a', name: custom[2], id: custom[3], raw };
    if (/[<>:]/.test(raw)) return null;
    if ([...raw].length > 8) return null;
    // Requires a real emoji code point; rejects bare text such as "garbage" or "1".
    if (!/\p{Emoji}/u.test(raw)) return null;
    if (/^[0-9A-Za-z#*]$/.test(raw)) return null;
    return { kind: 'unicode', raw };
}

function normalizeValue(value, key) {
    if (value === null || value === undefined || String(value).trim() === '') return DEFAULTS[key];
    const parsed = parse(value);
    if (!parsed) throw new Error(`Invalid emoji for ${LABELS[key] || key}. Use a Unicode emoji or <:name:id> / <a:name:id>.`);
    return parsed.raw;
}

function normalizeConfig(input) {
    const source = input && typeof input === 'object' ? input : {};
    const out = { ...DEFAULTS };
    for (const key of KEYS) {
        if (source[key] === undefined) continue;
        out[key] = normalizeValue(source[key], key);
    }
    return out;
}

// Custom emoji is only used when the bot can actually resolve it.
function render(client, config, key) {
    const stored = config?.emojis?.[key] ?? DEFAULTS[key];
    const parsed = parse(stored);
    if (!parsed) return DEFAULTS[key];
    if (parsed.kind === 'unicode') return parsed.raw;
    const cache = client?.emojis?.cache;
    if (!cache || typeof cache.get !== 'function') return parsed.raw;
    return cache.get(parsed.id) ? parsed.raw : DEFAULTS[key];
}

module.exports = { DEFAULTS, KEYS, LABELS, parse, normalizeValue, normalizeConfig, render };
