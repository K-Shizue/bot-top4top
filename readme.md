# converter_t4top

Discord bot that extracts audio from YouTube, TikTok, SoundCloud, and Spotify, encodes it to MP3 (192 kbps), and uploads it to Top4Top. The interface is built entirely with Discord Message Components V2 (flag `32768`).

---

## Specifications

- **Runtime:** Node.js (>= 18.0.0)
- **Library:** discord.js (v14)
- **Media Engine:** yt-dlp via `youtube-dl-exec`
- **Audio Output:** MP3, 192 kbps constant bitrate
- **Hosting Host:** Top4Top (`https://top4top.io/`)
- **UI Architecture:** Discord Message Components V2 (`IS_COMPONENTS_V2`, flag `32768`)
- **Legacy Artifacts:** No embeds (`embeds: []`), no plain message text (`content: ""`)

---

## Supported Sources & Extraction Pipeline

| Platform | Resolution Method | Format Handling | Thumbnail Source |
|---|---|---|---|
| **YouTube** | Direct yt-dlp extraction | Best audio stream -> FFmpeg MP3 transcode | Maxres / High-res video thumbnail |
| **TikTok** | Direct yt-dlp extraction | Video stream -> Audio extraction -> FFmpeg MP3 | Original TikTok cover image |
| **SoundCloud** | Direct yt-dlp extraction | Progressive/HLS audio stream -> FFmpeg MP3 | Track original artwork |
| **Spotify** | Open Graph metadata + oEmbed scrape -> YouTube query fallback (`ytsearch1:`) | Resolved audio stream -> FFmpeg MP3 | Spotify CDN album/track cover |

> **Note on Spotify:** Spotify streams are protected by FairPlay/Widevine DRM. The bot extracts canonical track title, artist, and cover art directly from Spotify metadata, then queries matching high-bitrate audio through the extraction engine.

---

## Discord Components V2 UI Schema

All interaction replies and deferred responses use message flag `32768` (`MessageFlags.IsComponentsV2`). The message payload structure consists of:

> **Important:** the flag must be present on **every** payload, including each `editReply`. Discord validates an edit against the flags carried by that payload, not the original `deferReply`. Omitting it produces `Invalid Form Body — components[0][UNION_TYPE_CHOICES]: Value of field "type" must be one of (1,)`, because a Container (`type: 17`) is not valid in a classic message. `convertFlow.v2()` wraps all conversion payloads so the flag can never be forgotten.

1. **Container (`type: 17`):**
   - Border accent color based on state:
     - Blue (`0x3498db`): Processing & stream resolution
     - Orange (`0xe67e22`): Upload in progress
     - Green (`0x2ecc71`): Upload complete
     - Red (`0xe74c3c`): Error encountered
2. **Text Display (`type: 10`):**
   - Markdown headings and track metadata (Title, Artist, Duration, File Size).
3. **Separator (`type: 14`):**
   - Visual boundary divider (`divider: true`) between components.
4. **Media Gallery (`type: 12`):**
   - Renders platform cover art or video thumbnail via `MediaGalleryItemBuilder`.
5. **Action Row & Button (`type: 1` & `type: 2`):**
   - Style `5` (Link) button directing to the generated Top4Top download URL.

---

## Prerequisites

1. **Node.js** v18.0.0 or higher:
   ```bash
   node -v
   ```
2. **FFmpeg** installed and accessible in system `PATH`:
   ```bash
   ffmpeg -version
   ```

---

## Installation

1. Clone repository:
   ```bash
   git clone https://github.com/roseeast/converter_t4top.git
   cd converter_t4top
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env` (see `.env.example`):
   ```env
   DISCORD_TOKEN=your_bot_token_here
   # Streaming presence URL, e.g. https://www.twitch.tv/your_channel
   STREAMING_URL=
   # Optional: extra user IDs allowed to manage global cookies (comma-separated)
   COOKIE_ADMIN_IDS=
   ```

---

## Usage

Start the bot process:
```bash
npm start
```
Or directly:
```bash
node index.js
```

### Slash Commands

- `/upload <url>`
  - Parameter `url` (String, required): Valid link from YouTube, TikTok, SoundCloud, or Spotify.
- `/setup panel`
  - Opens the ephemeral configuration dashboard (requires **Manage Server**).
- `/setup channel`
  - Configures the channel that receives upload history messages (requires **Manage Server**).
- `/setup cookies [file]`
  - Manages global `cookies.txt` (bot owner or IDs in `COOKIE_ADMIN_IDS`).

---

## Setup Panel

`/setup panel` opens an ephemeral Components V2 dashboard with a section select menu:

| Section | Fields |
|---|---|
| **General** | Title, description, footer text |
| **Appearance** | Accent color (hex), button labels, button emojis, button styles (1-4), **Emoji Settings** |
| **Images** | Banner URL, thumbnail URL |
| **Panel Management** | Preview, Deploy / Update, History Channel, Reset, yt-dlp status |

- **Preview** renders the panel ephemerally without posting it.
- **Deploy / Update** starts a three-step flow: pick a channel → confirm → post. The guild, channel, and message IDs are stored in `data/guild-configs.json`.
- Configuration is per guild and persists across restarts.

The public panel has two buttons:

- **Convert** — opens a modal for a URL, then runs the same pipeline as `/upload`.
- **Panel** — shows converter information, supported platforms, and usage.

### Deploying the panel to a channel

1. `/setup panel` → **Panel Management** → **Deploy / Update**.
2. Choose the destination with the channel select menu.
3. Review the confirmation and press **Confirm Deploy**.

Behaviour:

- Same channel as the stored panel → the existing message is edited in place (no duplicate).
- Different channel → a new panel is posted; the old panel is left untouched. The stored IDs now point to the new panel.
- Stored message deleted → a fresh panel is posted automatically.
- The bot checks **View Channel** and **Send Messages** before posting; a failure returns an error instead of throwing.
- **Cancel** returns to the dashboard.

### Emoji Settings

`/setup panel` → **Appearance** → **Emoji Settings** lets an administrator change the emoji used in upload messages without editing code:

| Key | Default | Used in |
|---|---|---|
| Title | 🎵 | Success message |
| Artist / Uploader | 👤 | Success message |
| Duration | ⏱️ | Success message |
| File Size | 📦 | Success message |
| Direct Download Link | 🔗 | Success message |
| Upload Success | ✅ | History channel message |

- Accepts Unicode emoji, static custom `<:name:id>`, and animated custom `<a:name:id>`.
- Pick an emoji button → paste the value → the dashboard shows a **Preview** before anything is saved.
- **Save** persists to the guild config; **Reset to Default** restores the defaults.
- Values are validated; invalid input is rejected. A custom emoji the bot cannot resolve (deleted or from another guild) renders as the Unicode fallback at send time.
- Changes apply to the next upload immediately — no restart. Settings are stored per guild.

## Upload History

Every successful Top4Top upload is stored in `data/upload-history.json` and, when configured, posted once to the guild's history channel.

Recorded fields:

```json
{
  "id": "1794770953532-8tlddx",
  "title": "Song",
  "artist": "Artist",
  "duration": 192,
  "fileSize": 4404019,
  "url": "http://top4top.io/p_xxx/file.mp3",
  "userId": "111111111111111111",
  "username": "user",
  "guildId": "222222222222222222",
  "uploadedAt": 1794770953532
}
```

- Written only after the Top4Top upload succeeds; failed uploads are never recorded.
- One record per upload, one history message per upload.
- Writes are serialized and atomic (temp file + rename), so concurrent uploads cannot corrupt or drop records.
- Corrupted history files are tolerated: the bot logs a warning and starts from an empty list rather than crashing.
- The file is capped at the newest 20 000 records.
- No tokens, cookies, or other secrets are stored.

### `/setup channel`

`/setup channel` opens the history channel dashboard:

- **Channel select** — restricted to guild text/announcement channels.
- **Save** — persists the selected channel for the guild.
- **Update** — re-validates and re-applies the active channel (useful after permission changes).
- **Disable** — clears the setting; uploads keep working without history messages.
- Permission is checked before saving; a channel the bot cannot post in is rejected.

History messages use Components V2:

```
### ✅ Song - Artist

🔗 **Top4Top Direct Link:**
http://top4top.io/p_xxx/file.mp3

👤 **Uploaded by:** <@USER_ID>
```

- One message per upload for all users.
- A missing channel, deleted channel, missing permission, or send failure is logged and does **not** affect the upload reply.
- History is never replayed on restart.

### Backup & restore

The bot's persistent state is two files:

| File | Contents |
|---|---|
| `data/guild-configs.json` | Panel, emoji, history channel, deployment config per guild |
| `data/upload-history.json` | Upload history records |
| `data/secure/cookies.txt` | Global cookies (sensitive) |

Backup:

```bash
tar -czf keju-backup-$(date +%F).tar.gz data/guild-configs.json data/upload-history.json data/secure/cookies.txt
```

Restore (stop the bot first to avoid overlapping writes):

```bash
pm2 stop keju-bot
tar -xzf keju-backup-YYYY-MM-DD.tar.gz
pm2 start keju-bot
```

`data/upload-history.json` is git-ignored; keep backups outside the repository. Cookies are credentials — store backups encrypted and never commit them.

## Audio Upload Success Message

All conversion flows share `convertFlow.js`, so `/upload` and the panel **Convert** button render the same success layout:

```
🎵 Title: `Song`
👤 Artist / Uploader: `Artist`
⏱️ Duration: `03:12`
📦 Size: `4.20 MB`
🔗 Direct Download Link: [Top4Top Direct Link](http://top4top.io/...)
Uploaded via Mila Bot
```

- Components V2 Container with the green success accent.
- No thumbnail / MediaGallery.
- No "Download Audio File" button — the clickable markdown link is the only download path.
- The Top4Top HTTP normalization and MP3 192 kbps pipeline are unchanged.

## Global Cookies

`/setup cookies` shows status (existence, size, cookie count, auth state) and offers **Validate auth** and **Delete** buttons. Upload with:

```
/setup cookies file:cookies.txt
```

- Only the bot owner, or user IDs listed in `COOKIE_ADMIN_IDS` (comma-separated), may manage cookies.
- Stored at `data/secure/cookies.txt` with mode `0600`; the directory is git-ignored.
- Files must be Netscape HTTP Cookie File format, `.txt`, and under 1 MB.
- Cookies are sent to yt-dlp only for YouTube-family hosts (and `ytsearch1:` Spotify fallbacks).
- Validation runs a minimal yt-dlp probe; a syntactically valid file is not proof of working authentication.
- Cookie contents are never displayed, logged, or sent to third-party validators.

## yt-dlp Auto Updates
`src/utils/ytdlpUpdater.js` manages the binary bundled by `youtube-dl-exec` (`node_modules/youtube-dl-exec/bin/yt-dlp[.exe]`).

- Runs once at startup and every 24 hours.
- Tries the binary's own `-U` self-update; falls back to downloading the latest release asset from GitHub.
- Logs old → new versions, never crashes the bot on failure, and keeps the last working binary.
- Concurrent updates are coalesced into a single in-flight promise.
- Manual trigger: `/setup panel` → **Panel Management** → **yt-dlp status**.

## Top4Top HTTP Links
Top4Top results are normalized to `http://` before being shown to users, because SA-MP clients only play HTTP audio streams.

- `Top4TopUploader.normalizeTop4TopUrl()` rewrites only the protocol (`https:` → `http:`), case-insensitively.
- Hostname, path, query string, and fragment are untouched.
- Applies to `/upload` and to the panel **Convert** button, since both share `convertFlow.js`.
- Source URLs (YouTube, TikTok, SoundCloud, Spotify) and the upload request itself are unchanged.

## Streaming Presence
Set `STREAMING_URL` in `.env` to a full `http(s)` URL (for example a Twitch or YouTube live channel). The bot then shows:

> **Streaming** — Bot convert by KEJU

- Applied on `ready` and re-applied on `shardResume` after a gateway reconnect.
- If `STREAMING_URL` is missing or invalid, the bot logs a clear warning and keeps running without the streaming presence.

## VPS Requirements

No new environment variables are required. On the VPS:

1. **Writable `data/` directory** — the bot writes `guild-configs.json`, `upload-history.json`, and `secure/cookies.txt`. Run with a user that owns the directory:
   ```bash
   mkdir -p data/secure
   chown -R $(whoami) data
   chmod 700 data/secure
   ```
2. **Persist `data/` across deploys** — keep it outside the git checkout or add it to your deploy exclusions, otherwise history and config are wiped on redeploy.
3. **PM2** — run with a stable name and rely on restart to reload the process (config and history are read from disk, so no in-memory state must survive):
   ```bash
   pm2 start index.js --name keju-bot
   pm2 save
   ```
4. **Discord permissions** for the bot in target channels:
   - Send Messages, View Channel (panel deploy and history channel)
   - Embed Links (informational)
   - **Use External Emojis** — required when an administrator configures a custom emoji from another guild; without it, Discord strips the emoji from the message
5. **`/setup` access** — requires the **Manage Server** permission. Cookies additionally require bot owner or `COOKIE_ADMIN_IDS`.




---

## Project Structure

```
converter_t4top/
├── .env                  # Environment configuration
├── .env.example          # Documented environment template
├── .gitignore            # Ignored paths (node_modules, downloads, .env, data/secure)
├── index.js              # Client gateway, command loader, interaction router
├── package.json          # Package manifest and runtime scripts
├── readme.md             # Technical documentation
├── data/
│   ├── guild-configs.json  # Per-guild panel, emoji, history channel config
│   ├── upload-history.json # Append-only upload history (git-ignored)
│   └── secure/
│       └── cookies.txt     # Global cookies (git-ignored, mode 0600)
├── test/
│   ├── selfcheck.js        # Config, cookies format, validation assertions
│   ├── payloadcheck.js     # Components V2 payload construction
│   ├── interactioncheck.js # Button/select/modal/deploy/emoji routing
│   ├── historycheck.js     # Upload history persistence + concurrency
│   ├── emojicheck.js       # Emoji parse/validate/render + per-guild storage
│   ├── successcheck.js     # Success layout + history channel delivery
│   ├── convertcheck.js     # Shared conversion pipeline with stubbed downloader/uploader
│   ├── convertmodalcheck.js # Panel Convert modal: single ack, V2 flags on every edit
│   ├── updatecheck.js      # Top4Top HTTP normalization + streaming presence
│   └── uploadercheck.js    # Uploader returns http links end-to-end
└── src/
    ├── commands/
    │   ├── upload.js     # /upload slash command
    │   └── setup.js      # /setup panel | channel | cookies
    ├── handlers/
    │   └── interactionHandler.js  # Buttons, select menus, modals
    └── utils/
        ├── downloader.js # yt-dlp wrapper, Spotify resolver, cookies injection
        ├── uploader.js   # Top4Top session initialization and multipart upload
        ├── convertFlow.js    # Shared download -> upload -> reply pipeline
        ├── configManager.js  # Per-guild config persistence and validation
        ├── panelBuilder.js   # Components V2 panel, dashboard, modals
        ├── cookiesManager.js # cookies.txt storage, validation, auth probe
        ├── emoji.js          # Emoji parsing, validation, Unicode fallback
        ├── uploadHistory.js  # Serialized JSON upload history store
        ├── historyChannel.js # History message builder + delivery
        ├── presence.js       # Streaming presence ("Bot convert by KEJU")
        └── ytdlpUpdater.js   # yt-dlp version detection and auto update
```

---

## Error Handling & File Lifecycle

- Audio files are temporarily saved to `./downloads` with timestamped filenames.
- Upon upload completion or error, `MusicDownloader.cleanupFile` unlinks the temporary file immediately.
- If an unhandled exception occurs, an ephemeral error Container is returned to the user with debug details.
