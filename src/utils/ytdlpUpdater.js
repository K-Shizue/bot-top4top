const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RELEASES_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const ASSET = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const TIMEOUT_MS = 60 * 1000;

let inflight = null;
let timer = null;
let lastCheck = null;

// youtube-dl-exec always appends `-- <url>`, so flags go through execFile directly.
function binaryPath() {
    const constants = require('youtube-dl-exec/src/constants');
    return constants.YOUTUBE_DL_PATH;
}

function run(args, timeout = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        execFile(binaryPath(), args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(Object.assign(new Error(stderr || err.message), { stderr, stdout }));
            resolve(String(stdout).trim());
        });
    });
}

async function currentVersion() {
    try {
        return (await run(['--version'])) || null;
    } catch {
        return null;
    }
}

function fetchJson(url, redirects = 3) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'converter_t4top-updater' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(fetchJson(res.headers.location, redirects - 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`GitHub API responded ${res.statusCode}`));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON from GitHub API')); }
            });
        }).on('error', reject);
    });
}

function download(url, dest, redirects = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'converter_t4top-updater' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(download(res.headers.location, dest, redirects - 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const tmp = `${dest}.download`;
            const file = fs.createWriteStream(tmp);
            res.pipe(file);
            file.on('finish', () => file.close(() => {
                try { fs.renameSync(tmp, dest); } catch (e) { return reject(e); }
                try { fs.chmodSync(dest, 0o755); } catch {}
                resolve();
            }));
            file.on('error', err => { try { fs.unlinkSync(tmp); } catch {} reject(err); });
        }).on('error', reject);
    });
}

async function downloadLatest() {
    const release = await fetchJson(RELEASES_API);
    const asset = (release.assets || []).find(a => a.name === ASSET);
    if (!asset) throw new Error(`Release asset ${ASSET} not found.`);
    const dest = binaryPath();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await download(asset.browser_download_url, dest);
}

async function performUpdate({ force = false } = {}) {
    const before = await currentVersion();
    if (!before) console.warn('[ytdlp] Could not detect installed yt-dlp version.');

    let after = null;
    try {
        await run(['-U'], 180 * 1000);
        after = await currentVersion();
        if (!after) throw new Error('Binary did not report a version after self-update.');
    } catch (err) {
        console.warn(`[ytdlp] Self-update unavailable (${String(err.message).split('\n')[0]}), downloading release asset.`);
        await downloadLatest();
        after = await currentVersion();
    }

    if (!after) throw new Error('yt-dlp update finished but the version is still unknown.');

    const changed = before !== after;
    if (changed || force) console.log(`[ytdlp] yt-dlp ${before || 'unknown'} -> ${after}`);
    else console.log(`[ytdlp] yt-dlp already up to date (${after}).`);

    return { before, after, changed };
}

function update(options = {}) {
    if (inflight) return inflight;
    inflight = performUpdate(options)
        .catch(err => {
            console.error(`[ytdlp] Update failed, keeping last working version: ${err.message}`);
            return { error: err.message };
        })
        .finally(() => {
            inflight = null;
            lastCheck = Date.now();
        });
    return inflight;
}

function startScheduler() {
    if (timer) return;
    update();
    timer = setInterval(() => update(), CHECK_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
}

function stopScheduler() {
    if (timer) clearInterval(timer);
    timer = null;
}

module.exports = {
    CHECK_INTERVAL_MS, currentVersion, update, startScheduler, stopScheduler,
    isUpdating: () => Boolean(inflight),
    lastCheckAt: () => lastCheck,
    binaryPath,
};
