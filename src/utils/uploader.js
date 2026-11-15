const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class Top4TopUploader {
    static BASE_URL = "https://top4top.io/";
    static UPLOAD_URL = "https://top4top.io/index.php";

    // SA-MP clients only play http:// links, so the returned URL is downgraded.
    static normalizeTop4TopUrl(url) {
        if (typeof url !== 'string') return url;
        return url.replace(/^https:\/\//i, 'http://');
    }

    static async uploadFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        try {
            const getResponse = await axios.get(this.BASE_URL);
            if (getResponse.status !== 200) {
                throw new Error(`Failed to fetch homepage: ${getResponse.status}`);
            }

            const $ = cheerio.load(getResponse.data);
            const sid = $('input[name="sid"]').val();

            if (!sid) {
                throw new Error("Could not find session ID (sid) on the page. The site might have changed.");
            }

            const form = new FormData();
            form.append('sid', sid);
            form.append('submitr', '[ رفع الملفات ]');
            form.append('file_1_', fs.createReadStream(filePath), {
                filename: path.basename(filePath)
            });

            const uploadResponse = await axios.post(this.UPLOAD_URL, form, {
                headers: {
                    ...form.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            if (uploadResponse.status !== 200) {
                throw new Error(`Upload failed with status: ${uploadResponse.status}`);
            }

            const result$ = cheerio.load(uploadResponse.data);
            let downloadLink = null;

            result$('textarea, input').each((_, el) => {
                const val = result$(el).val() || result$(el).text();
                if (val && val.includes('top4top.io') && val.includes('http')) {
                    if (!val.includes('[url') && !val.includes('<a href')) {
                        downloadLink = val.trim();
                        return false;
                    }
                }
            });

            if (!downloadLink) {
                result$('a').each((_, a) => {
                    const href = result$(a).attr('href');
                    if (href && (href.includes('top4top.io/p_') || href.includes('top4top.io/m_'))) {
                        downloadLink = href;
                        return false;
                    }
                });
            }

            if (!downloadLink) {
                throw new Error("Upload successful, but could not parse the download link.");
            }

            return this.normalizeTop4TopUrl(downloadLink);

        } catch (error) {
            console.error(error);
            throw new Error(`Error during file upload: ${error.message}`);
        }
    }
}

module.exports = Top4TopUploader;
