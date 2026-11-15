// Append-only upload history. Writes are serialized so concurrent uploads cannot corrupt the file.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'upload-history.json');
const MAX_RECORDS = 20000;

let queue = Promise.resolve();

function readAll() {
    try {
        if (!fs.existsSync(HISTORY_PATH)) return [];
        const raw = fs.readFileSync(HISTORY_PATH, 'utf8').trim();
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error(`[history] Corrupted history file, starting fresh: ${err.message}`);
        return [];
    }
}

function writeAll(records) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${HISTORY_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
    fs.renameSync(tmp, HISTORY_PATH);
}

// Serialized read-modify-write so parallel uploads cannot lose records.
function enqueue(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
}

function record({ title, artist, duration, fileSize, url, userId, username, guildId, uploadedAt = Date.now() }) {
    if (!url) throw new Error('Upload history requires a URL.');
    return {
        id: `${uploadedAt}-${Math.random().toString(36).slice(2, 8)}`,
        title: String(title ?? 'Unknown Title').slice(0, 300),
        artist: String(artist ?? 'Unknown').slice(0, 300),
        duration: Number(duration) || 0,
        fileSize: Number(fileSize) || 0,
        url: String(url).slice(0, 2048),
        userId: userId ? String(userId) : null,
        username: username ? String(username).slice(0, 100) : null,
        guildId: guildId ? String(guildId) : null,
        uploadedAt,
    };
}

function add(entry) {
    let item;
    try {
        item = record(entry);
    } catch (err) {
        return Promise.reject(err);
    }
    return enqueue(() => {
        const all = readAll();
        all.push(item);
        writeAll(all.length > MAX_RECORDS ? all.slice(-MAX_RECORDS) : all);
        return item;
    });
}

function all() {
    return readAll();
}

function count() {
    return readAll().length;
}

module.exports = { HISTORY_PATH, add, all, count, record };
