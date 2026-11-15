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
- `/setup cookies [file]`
  - Manages global `cookies.txt` (bot owner or IDs in `COOKIE_ADMIN_IDS`).

---

## Setup Panel

`/setup panel` opens an ephemeral Components V2 dashboard with a section select menu:

| Section | Fields |
|---|---|
| **General** | Title, description, footer text |
| **Appearance** | Accent color (hex), button labels, button emojis, button styles (1-4) |
| **Images** | Banner URL, thumbnail URL |
| **Panel Management** | Preview, Deploy / Update, Reset, yt-dlp status |

- **Preview** renders the panel ephemerally without posting it.
- **Deploy / Update** posts the panel to the current channel. The channel and message IDs are stored in `data/guild-configs.json`, so pressing it again edits the existing message instead of creating duplicates. If the message was deleted, a fresh panel is posted automatically.
- Configuration is per guild and persists across restarts.

The public panel has two buttons:

- **Convert** — opens a modal for a URL, then runs the same pipeline as `/upload`.
- **Panel** — shows converter information, supported platforms, and usage.

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
│   ├── guild-configs.json  # Per-guild panel configuration
│   └── secure/
│       └── cookies.txt     # Global cookies (git-ignored, mode 0600)
├── test/
│   ├── selfcheck.js        # Config, cookies format, validation assertions
│   ├── payloadcheck.js     # Components V2 payload construction
│   ├── interactioncheck.js # Button/select/modal routing with mocked interactions
│   ├── convertcheck.js     # Shared conversion pipeline with stubbed downloader/uploader
│   ├── convertmodalcheck.js # Panel Convert modal: single ack, V2 flags on every edit
│   ├── updatecheck.js      # Top4Top HTTP normalization + streaming presence
│   └── uploadercheck.js    # Uploader returns http links end-to-end
└── src/
    ├── commands/
    │   ├── upload.js     # /upload slash command
    │   └── setup.js      # /setup panel | cookies
    ├── handlers/
    │   └── interactionHandler.js  # Buttons, select menus, modals
    └── utils/
        ├── downloader.js # yt-dlp wrapper, Spotify resolver, cookies injection
        ├── uploader.js   # Top4Top session initialization and multipart upload
        ├── convertFlow.js    # Shared download -> upload -> reply pipeline
        ├── configManager.js  # Per-guild config persistence and validation
        ├── panelBuilder.js   # Components V2 panel, dashboard, modals
        ├── cookiesManager.js # cookies.txt storage, validation, auth probe
        ├── presence.js       # Streaming presence ("Bot convert by KEJU")
        └── ytdlpUpdater.js   # yt-dlp version detection and auto update
```

---

## Error Handling & File Lifecycle

- Audio files are temporarily saved to `./downloads` with timestamped filenames.
- Upon upload completion or error, `MusicDownloader.cleanupFile` unlinks the temporary file immediately.
- If an unhandled exception occurs, an ephemeral error Container is returned to the user with debug details.
