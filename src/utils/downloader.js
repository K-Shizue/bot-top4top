const youtubedl = require('youtube-dl-exec');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const CookiesManager = require('./cookiesManager');

const COOKIE_SOURCES = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

class MusicDownloader {
    static DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');

    // Cookies are global and only sent to sources that can use them.
    static cookieOptions(targetUrl) {
        if (!CookiesManager.exists()) return {};
        if (/^ytsearch/i.test(targetUrl)) return { cookies: CookiesManager.COOKIES_PATH };
        let host;
        try { host = new URL(targetUrl).hostname; } catch { return {}; }
        return COOKIE_SOURCES.test(host) ? { cookies: CookiesManager.COOKIES_PATH } : {};
    }

    static describeFailure(error) {
        const kind = CookiesManager.classifyFailure(error.stderr || error.message);
        if (kind === 'auth_rejected' || kind === 'captcha') {
            CookiesManager.markNeedsRevalidation();
            return `Download failed: ${CookiesManager.authHint() || error.message}`;
        }
        if (kind === 'network_error') return `Download failed: network error reaching the source. ${error.message}`;
        return `Download failed: ${error.message}`;
    }

    static ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    static async resolveSpotify(url) {
        try {
            let title = '';
            let artist = '';
            let thumbnail = '';

            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const $ = cheerio.load(response.data);
                const fullTitle = $('title').text() || '';
                const match = fullTitle.match(/^(.*?)\s*-\s*song\s*(?:and lyrics\s*)?by\s*(.*?)\s*\|\s*Spotify$/i);
                if (match) {
                    title = match[1].trim();
                    artist = match[2].trim();
                }
                thumbnail = $('meta[property="og:image"]').attr('content') || '';
            } catch (err) {}

            if (!title || !thumbnail) {
                try {
                    const oembedRes = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
                    if (!title) title = oembedRes.data?.title || '';
                    if (!thumbnail) thumbnail = oembedRes.data?.thumbnail_url || '';
                } catch (e) {}
            }

            if (!title) {
                throw new Error("Could not extract track information from Spotify URL.");
            }

            const searchQuery = artist ? `ytsearch1:${artist} - ${title}` : `ytsearch1:${title}`;
            return {
                targetUrl: searchQuery,
                resolvedTitle: title,
                resolvedArtist: artist,
                thumbnail: thumbnail || null
            };
        } catch (error) {
            console.error('Error resolving Spotify track:', error.message);
            throw new Error(`Failed to resolve Spotify link: ${error.message}`);
        }
    }

    static async downloadAudio(url) {
        this.ensureDir(this.DOWNLOAD_DIR);
        const timestamp = Math.floor(Date.now() / 1000);
        const outputTemplate = path.join(this.DOWNLOAD_DIR, `%(title)s_${timestamp}.%(ext)s`);

        let targetUrl = url;
        let originalSpotifyMeta = null;

        if (url.includes('spotify.com')) {
            originalSpotifyMeta = await this.resolveSpotify(url);
            targetUrl = originalSpotifyMeta.targetUrl;
        }

        try {
            const rawInfo = await youtubedl(targetUrl, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                preferFreeFormats: true,
                ...this.cookieOptions(targetUrl),
            });

            const info = (rawInfo.entries && rawInfo.entries.length > 0) ? rawInfo.entries[0] : rawInfo;

            const title = originalSpotifyMeta?.resolvedTitle || info.title || 'Unknown Title';
            const uploader = originalSpotifyMeta?.resolvedArtist || info.uploader || 'Unknown';
            const duration = info.duration || 0;
            const thumbnail = originalSpotifyMeta?.thumbnail || info.thumbnail || null;

            const directDownloadUrl = info.webpage_url || info.url || targetUrl;

            await youtubedl(directDownloadUrl, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '192K',
                output: outputTemplate,
                noWarnings: true,
                noCheckCertificate: true,
                ...this.cookieOptions(directDownloadUrl),
            });

            const files = fs.readdirSync(this.DOWNLOAD_DIR);
            const downloadedFile = files.find(f => f.includes(`_${timestamp}.mp3`));
            
            if (!downloadedFile) {
                throw new Error("Could not find the downloaded file in storage.");
            }

            const filePath = path.join(this.DOWNLOAD_DIR, downloadedFile);
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;

            return {
                filePath,
                title,
                duration,
                uploader,
                fileSize,
                thumbnail
            };
        } catch (error) {
            console.error(error);
            throw new Error(this.describeFailure(error));
        }
    }

    static cleanupFile(filePath) {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`Cleaned up: ${filePath}`);
            } catch (err) {
                console.error(`Error deleting file ${filePath}: ${err}`);
            }
        }
    }
}

module.exports = MusicDownloader;
