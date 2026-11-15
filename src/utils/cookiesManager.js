const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');

const SECURE_DIR = path.join(__dirname, '..', '..', 'data', 'secure');
const COOKIES_PATH = path.join(SECURE_DIR, 'cookies.txt');
const MAX_SIZE = 1024 * 1024;
const AUTH_PROBE_URL = 'https://www.youtube.com/watch?v=BaW_jenozKc';

let lastAuth = { state: 'unknown', at: null, detail: null };

function exists() {
    return fs.existsSync(COOKIES_PATH);
}

function validateContent(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'File is empty.' };
    if (Buffer.byteLength(text) > MAX_SIZE) return { ok: false, error: 'File exceeds 1 MB limit.' };

    const lines = text.split(/\r?\n/);
    const cookies = [];
    let sawHeader = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            if (/^#\s*(Netscape\s+)?HTTP\s+Cookie\s+File/i.test(line)) sawHeader = true;
            continue;
        }
        const fields = line.split('\t');
        if (fields.length !== 7) return { ok: false, error: 'Not a Netscape HTTP Cookie File (expected 7 tab-separated fields).' };
        const [domain, includeSub, cookiePath, secure, expires, name, value] = fields;
        if (!domain || !cookiePath || !name) return { ok: false, error: 'Cookie line is missing domain, path, or name.' };
        if (includeSub !== 'TRUE' && includeSub !== 'FALSE') return { ok: false, error: 'Cookie line has invalid include-subdomains flag.' };
        if (secure !== 'TRUE' && secure !== 'FALSE') return { ok: false, error: 'Cookie line has invalid secure flag.' };
        if (!/^\d+$/.test(expires)) return { ok: false, error: 'Cookie line has invalid expiry.' };
        if (!value) return { ok: false, error: 'Cookie line has an empty value.' };
        cookies.push({ domain, name });
    }

    if (cookies.length === 0) return { ok: false, error: 'No cookie entries found.' };
    return { ok: true, count: cookies.length, header: sawHeader, domains: [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))] };
}

function save(buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('Invalid file data.');
    if (buffer.length > MAX_SIZE) throw new Error('File exceeds 1 MB limit.');
    const text = buffer.toString('utf8');
    const check = validateContent(text);
    if (!check.ok) throw new Error(`Invalid cookies.txt: ${check.error}`);

    fs.mkdirSync(SECURE_DIR, { recursive: true });
    const tmp = path.join(SECURE_DIR, `.cookies.${process.pid}.tmp`);
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    fs.renameSync(tmp, COOKIES_PATH);
    try { fs.chmodSync(COOKIES_PATH, 0o600); } catch {}
    lastAuth = { state: 'unknown', at: null, detail: null };
    return check;
}

function remove() {
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
    lastAuth = { state: 'unknown', at: null, detail: null };
    return true;
}

function status() {
    if (!exists()) return { exists: false, auth: lastAuth };
    const stats = fs.statSync(COOKIES_PATH);
    const check = validateContent(fs.readFileSync(COOKIES_PATH, 'utf8'));
    return {
        exists: true,
        size: stats.size,
        modified: stats.mtime,
        count: check.ok ? check.count : 0,
        domains: check.ok ? check.domains.slice(0, 8) : [],
        formatOk: check.ok,
        auth: lastAuth,
    };
}

function classifyFailure(stderr) {
    const text = String(stderr || '');
    if (/Sign in to confirm|cookies are no longer valid|authentication|login required|confirm you.re not a bot/i.test(text)) return 'auth_rejected';
    if (/captcha|unusual traffic/i.test(text)) return 'captcha';
    if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|getaddrinfo|Temporary failure|network/i.test(text)) return 'network_error';
    if (/private video|video is private|members-only|age-restricted|not available in your country/i.test(text)) return 'restricted';
    return 'unknown_error';
}

async function validateAuth() {
    if (!exists()) {
        lastAuth = { state: 'missing', at: Date.now(), detail: 'No cookies.txt uploaded.' };
        return lastAuth;
    }
    try {
        await youtubedl(AUTH_PROBE_URL, {
            cookies: COOKIES_PATH,
            simulate: true,
            skipDownload: true,
            noWarnings: true,
            noPlaylist: true,
            noCheckCertificate: true,
            socketTimeout: 15,
        });
        lastAuth = { state: 'auth_ok', at: Date.now(), detail: 'Authentication accepted by YouTube.' };
    } catch (err) {
        const state = classifyFailure(err.stderr || err.message);
        lastAuth = { state, at: Date.now(), detail: state === 'auth_rejected'
            ? 'YouTube rejected the cookies. Export a fresh cookies.txt from your browser and upload it again.'
            : state === 'captcha'
                ? 'CAPTCHA / bot verification required. Re-export cookies after solving it in the browser.'
                : state === 'network_error'
                    ? 'Network error while validating. Cookies were not deleted.'
                    : state === 'restricted'
                        ? 'Probe video is restricted in this region/account.'
                        : 'Validation could not complete.' };
    }
    return lastAuth;
}

function markNeedsRevalidation(detail) {
    lastAuth = { state: 'auth_rejected', at: Date.now(), detail: detail || 'Authentication rejected during download.' };
}

function authHint() {
    if (!exists()) return null;
    if (lastAuth.state === 'auth_rejected') return 'Cookies were rejected by YouTube. An administrator must upload a fresh cookies.txt via `/setup cookies`.';
    return null;
}

module.exports = {
    COOKIES_PATH, MAX_SIZE, exists, validateContent, save, remove, status,
    validateAuth, markNeedsRevalidation, authHint, classifyFailure,
};
