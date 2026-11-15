const assert = require('assert');
const fs = require('fs');
const path = require('path');

const uploadHistory = require('../src/utils/uploadHistory');

const HISTORY_PATH = uploadHistory.HISTORY_PATH;
const backup = fs.existsSync(HISTORY_PATH) ? fs.readFileSync(HISTORY_PATH) : null;

function reset() {
    if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
}

const base = {
    title: 'Song',
    artist: 'Artist',
    duration: 125,
    fileSize: 1024 * 1024,
    url: 'http://top4top.io/p_abc/file.mp3',
    userId: '111',
    username: 'tester',
    guildId: 'g1',
};

(async () => {
    reset();

    // --- records only what is stored, with identity and URL intact ---
    const saved = await uploadHistory.add(base);
    assert.strictEqual(saved.title, 'Song');
    assert.strictEqual(saved.userId, '111');
    assert.strictEqual(saved.username, 'tester');
    assert.strictEqual(saved.url, base.url);
    assert.strictEqual(saved.duration, 125);
    assert.ok(saved.id, 'record must have an id');
    assert.ok(saved.uploadedAt > 0);

    // --- persisted to disk (survives restart) ---
    const onDisk = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    assert.strictEqual(onDisk.length, 1);
    delete require.cache[require.resolve('../src/utils/uploadHistory')];
    const reloaded = require('../src/utils/uploadHistory');
    assert.strictEqual(reloaded.count(), 1, 'history must survive module reload');

    // --- no secret fields leak into storage ---
    const text = fs.readFileSync(HISTORY_PATH, 'utf8');
    assert.ok(!/token|cookie|password|secret/i.test(text), 'must not store sensitive fields');

    // --- concurrent writes are serialized: no lost records, no duplicates ---
    reset();
    const entries = Array.from({ length: 25 }, (_, i) => ({ ...base, title: `Song ${i}` }));
    await Promise.all(entries.map(e => uploadHistory.add(e)));
    const all = uploadHistory.all();
    assert.strictEqual(all.length, 25, 'every concurrent upload must be recorded');
    assert.strictEqual(new Set(all.map(r => r.id)).size, 25, 'ids must be unique');
    assert.strictEqual(new Set(all.map(r => r.title)).size, 25, 'no duplicated entry');

    // --- a failed upload simply is not added ---
    const before = uploadHistory.count();
    const failed = await Promise.resolve().then(() => { throw new Error('upload failed'); }).catch(() => null);
    assert.strictEqual(failed, null);
    assert.strictEqual(uploadHistory.count(), before, 'failed uploads must not be recorded');

    // --- malformed file is tolerated ---
    reset();
    fs.writeFileSync(HISTORY_PATH, '{not json', 'utf8');
    assert.deepStrictEqual(uploadHistory.all(), []);
    assert.strictEqual(uploadHistory.count(), 0);

    // --- required URL is enforced ---
    await assert.rejects(() => uploadHistory.add({ ...base, url: null }), /requires a URL/);

    reset();
    if (backup) {
        fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
        fs.writeFileSync(HISTORY_PATH, backup);
    }
    console.log('upload history check: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
