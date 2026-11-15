# MASTER TASK: Top4Top Converter Bot --- Custom Setup Panel, yt-dlp Auto Updater & Cookies Manager

You are working on an existing Discord Bot project named
`converter_t4top`.

Your task is to upgrade the existing project with three major features:

1.  Interactive `/setup` Custom Panel System.
2.  Automatic yt-dlp Update Manager.
3.  `/setup cookies` Cookies Manager.

------------------------------------------------------------------------

# 0. DEVELOPMENT RULES --- READ FIRST

Before implementation:

-   Inspect the existing project structure once.
-   Read the relevant source files once.
-   Understand the existing command loader, interaction handler,
    downloader, uploader, and package dependencies.
-   Create a short internal implementation plan.
-   Execute the implementation without repeatedly re-inspecting
    unchanged files.

**Efficiency requirements:**

-   Avoid repeated repository scans.
-   Do not repeatedly read files that have already been inspected unless
    changes require verification.
-   Do not repeatedly explain the same implementation plan.
-   Do not perform unnecessary searches or research.
-   Do not ask for confirmation between implementation stages.
-   Do not generate multiple alternative implementations.
-   Do not introduce unnecessary dependencies.
-   Reuse existing modules and functionality wherever possible.
-   Batch related code changes logically.
-   Run targeted tests instead of repeatedly running the entire test
    suite.
-   Perform one final comprehensive verification after all
    implementation stages are complete.

If something is already implemented correctly, preserve it instead of
rebuilding it.

Do not spend tokens explaining trivial operations. Prioritize
implementation.

# 1. PROJECT PRESERVATION

Preserve all existing functionality.

Existing project features:

-   Discord.js v14.
-   Node.js 18 or newer.
-   `/upload` slash command.
-   YouTube support.
-   TikTok support.
-   SoundCloud support.
-   Spotify metadata resolution and YouTube fallback.
-   yt-dlp through youtube-dl-exec.
-   FFmpeg MP3 conversion at 192 kbps.
-   Automatic Top4Top uploading.
-   Discord Components V2 interface.

**Important:** Do not unnecessarily rewrite:

-   `src/utils/downloader.js`
-   `src/utils/uploader.js`
-   Existing Spotify resolution logic.
-   Existing Top4Top upload logic.

Modify these only where required for integration.

Existing `/upload` must continue working.

# 2. FEATURE ONE --- INTERACTIVE /setup CUSTOM PANEL

Create a new slash command:

`/setup`

This command opens an interactive configuration dashboard for server
administrators.

The purpose is to allow administrators to customize the appearance and
content of their public Converter Panel without editing source code.

## 2.1 Public Converter Panel

The deployed panel must contain:

-   Custom title.
-   Custom description.
-   Custom banner image.
-   Custom thumbnail image, where supported.
-   Custom accent color.
-   Custom footer text.
-   Two primary buttons:
    1.  Convert
    2.  Panel

The design should be modern, clean, professional, and consistent with
the existing Components V2 interface.

The panel must support independent configurations for different Discord
guilds.

## 2.2 Convert Button

When a user clicks Convert:

-   Open a Discord Modal requesting an audio URL.
-   Validate the submitted URL.
-   Reuse the existing downloader.
-   Reuse the existing Top4Top uploader.
-   Display processing status.
-   Display upload progress or appropriate status messages.
-   Display the resulting download link.

Supported platforms must remain compatible with the existing downloader.

Do not duplicate the audio processing pipeline.

## 2.3 Panel Button

When a user clicks Panel:

Display an information panel containing:

-   Converter information.
-   Supported platforms.
-   Basic usage instructions.
-   Configurable information where appropriate.

## 2.4 Setup Dashboard

The administrator dashboard should support the following categories.

**GENERAL:** - Panel title. - Panel description. - Footer text.

**APPEARANCE:** - Accent color. - Button labels. - Button emojis. -
Button styles.

**IMAGES:** - Banner image URL. - Thumbnail image URL.

**PANEL MANAGEMENT:** - Preview configuration. - Deploy panel. - Update
existing deployed panel. - Reset configuration.

Use Discord Modals, Buttons, and Select Menus where appropriate.

Use ephemeral messages for administrative configuration.

## 2.5 Panel Deployment

When deploying:

-   Allow the administrator to deploy to the current channel.
-   Save the deployed channel ID and message ID.
-   Allow updating the existing deployed panel instead of creating
    duplicates.
-   If the previous message no longer exists, provide a safe
    redeployment mechanism.
-   Ensure the panel remains functional after bot restarts.

# 3. FEATURE TWO --- yt-dlp AUTO UPDATE MANAGER

Implement an automatic yt-dlp update manager.

Suggested module:

`src/utils/ytdlpUpdater.js`

Requirements:

1.  Detect the currently installed yt-dlp version.
2.  Check for a newer stable release at bot startup.
3.  Update automatically when a newer version is available.
4.  Perform periodic update checks every 24 hours.
5.  Log old and new version numbers.
6.  Prevent simultaneous update processes.
7.  Handle network errors and update failures gracefully.
8.  Do not crash the Discord bot if updating fails.
9.  Keep using the last working version if an update fails.
10. Never update yt-dlp for every individual conversion.

**Important:**

Inspect how `youtube-dl-exec` installs and manages its yt-dlp binary.

Use the correct update mechanism for the actual installed binary.

Do not blindly assume that the system has a globally installed yt-dlp
executable.

Provide an administrator-accessible way to check the current version and
manually trigger an update.

Avoid unnecessary update checks. Use a sensible update interval and
prevent concurrent checks.

# 4. FEATURE THREE --- /setup cookies MANAGER

Extend the `/setup` system with a Cookies Manager.

Suggested command:

`/setup cookies`

The Cookies Manager should provide:

-   Upload cookies.txt.
-   Validate cookies.txt.
-   View cookies status.
-   Replace cookies.txt.
-   Delete cookies.txt.

Cookies should be managed globally for the bot, not independently for
every Discord guild.

Only the bot owner or explicitly authorized administrators should be
able to manage global cookies.

Do not allow every server administrator to access global credentials by
default.

## 4.1 Cookies Upload

Allow authorized users to upload a `cookies.txt` file through a Discord
attachment.

Requirements:

-   Accept `.txt` attachments.
-   Enforce a reasonable file-size limit.
-   Validate Netscape HTTP Cookie File syntax.
-   Reject invalid files.
-   Protect against path traversal.
-   Store the file locally at:

`data/secure/cookies.txt`

-   Set restrictive file permissions where supported.
-   Never display cookies content in Discord.
-   Never log cookie values.
-   Never send cookies to unrelated external services.

Update `.gitignore` to exclude:

`data/secure/` `cookies.txt`

Do not commit real authentication cookies to Git.

## 4.2 Cookies Validation

Distinguish between:

-   Missing cookies.
-   Invalid file format.
-   Syntactically valid cookies.
-   Valid authentication.
-   Expired or rejected authentication.
-   CAPTCHA or verification requirements.
-   Network errors.
-   Account restrictions.

**Important:**

A syntactically valid file does not necessarily contain valid
authentication.

Do not claim that cookies are valid merely because the file exists.

Use a safe and minimal authentication check through yt-dlp when
appropriate.

Do not expose cookies to external validation websites.

If authentication is rejected, notify the authorized administrator that
a fresh cookies.txt file must be exported from their own browser and
uploaded again.

Cookies cannot be automatically renewed after expiration.

Do not implement browser cookie theft, session extraction from other
users, or credential harvesting.

## 4.3 Cookies Storage

Use:

`data/secure/cookies.txt`

Provide functionality to:

-   Upload.
-   Replace.
-   Validate.
-   Delete.
-   Check status.

Never automatically delete cookies merely because a download fails.

Distinguish authentication failures from network errors, CAPTCHA, and
unrelated download errors.

# 5. DOWNLOADER INTEGRATION

Integrate Cookies Manager into the existing:

`src/utils/downloader.js`

Requirements:

-   Detect whether a cookies file exists.
-   Use validated cookies when available.
-   Pass the appropriate cookies option to yt-dlp.
-   Continue normal downloads without cookies when unavailable.
-   Use cookies only for appropriate supported sources.
-   Handle authentication errors with useful messages.
-   Never expose sensitive cookies information in public errors.

If YouTube rejects authentication:

-   Mark cookies as requiring revalidation.
-   Notify the authorized bot administrator.
-   Do not repeatedly retry the same failed authentication.
-   Do not affect TikTok, SoundCloud, or other unrelated download
    workflows.

Preserve the existing MP3 192 kbps conversion pipeline.

# 6. INTERACTION HANDLER

Update the existing interaction system to support:

-   Chat input commands.
-   Button interactions.
-   String Select Menus.
-   Modal submissions.
-   Attachment handling where applicable.

Suggested module:

`src/handlers/interactionHandler.js`

Avoid duplicate interaction listeners.

Use unique custom IDs for each interaction.

Check permissions again when processing every administrative
interaction.

Handle expired interactions and Discord acknowledgement timing
correctly.

Do not break existing `/upload` command handling.

# 7. CONFIGURATION STORAGE

Create persistent guild configuration storage.

Suggested file:

`data/guild-configs.json`

Example fields:

-   guildId
-   title
-   description
-   bannerUrl
-   thumbnailUrl
-   accentColor
-   footerText
-   convertButtonLabel
-   convertButtonEmoji
-   panelButtonLabel
-   panelButtonEmoji
-   panelChannelId
-   panelMessageId

Requirements:

-   Independent configuration per guild.
-   Persistent after restarts.
-   Sensible default configuration.
-   Safe file operations.
-   Handle missing or corrupted configuration files.
-   Avoid overwriting other guild configurations.

Global cookies must remain separate from guild configurations.

Suggested module:

`src/utils/configManager.js`

# 8. SECURITY

Implement appropriate security protections.

-   Admin-only setup configuration.
-   Explicit authorization for global cookies management.
-   Permission verification on every interaction.
-   URL validation.
-   Color validation.
-   File-size validation.
-   Attachment validation.
-   Path traversal protection.
-   Secure cookie storage.
-   No credential logging.
-   No token exposure.
-   No hardcoded guild IDs.
-   No external license API.

Do not implement any licensing system.

Explicitly exclude:

-   Server license verification.
-   License activation.
-   License keys.
-   License expiration.
-   Premium server restrictions.
-   Server registration.
-   External license APIs.

Only implement the customization, updater, and cookies management
functionality.

# 9. DISCORD COMPONENTS V2

Preserve the existing Discord Components V2 architecture.

Use compatible Discord.js builders:

-   ContainerBuilder.
-   TextDisplayBuilder.
-   SeparatorBuilder.
-   MediaGalleryBuilder.
-   ActionRowBuilder.
-   ButtonBuilder.
-   StringSelectMenuBuilder.
-   ModalBuilder.
-   TextInputBuilder.

Use `MessageFlags.IsComponentsV2` where appropriate.

Do not incorrectly mix classic embed properties with Components V2
messages.

Represent custom footer text using TextDisplayBuilder.

Use appropriate interaction response flags and component layouts.

# 10. SUGGESTED PROJECT STRUCTURE

Keep the architecture modular.

Suggested structure:

``` text
converter_t4top/
├── data/
│   ├── guild-configs.json
│   └── secure/
│       └── cookies.txt
├── src/
│   ├── commands/
│   │   ├── upload.js
│   │   └── setup.js
│   ├── handlers/
│   │   └── interactionHandler.js
│   └── utils/
│       ├── downloader.js
│       ├── uploader.js
│       ├── configManager.js
│       ├── panelBuilder.js
│       ├── cookiesManager.js
│       └── ytdlpUpdater.js
├── index.js
├── package.json
└── .gitignore
```

You may adjust the structure if the existing architecture requires it.

Do not create unnecessary files or duplicate existing modules.

# 11. FINAL TESTING

Perform one consolidated verification after implementation.

Verify:

**CUSTOM PANEL:** - `/setup` registers correctly. - Administrator
permissions work. - Custom title and description work. - Image
configuration works. - Accent color works. - Footer works. - Preview
works. - Panel deployment works. - Panel updates without unnecessary
duplicates. - Convert button invokes the existing downloader. - Panel
button displays information.

**YT-DLP:** - Version detection works. - Startup update check works. -
Periodic update check is scheduled. - Manual update works. - Failed
updates do not crash the bot. - Concurrent updates are prevented.

**COOKIES:** - `/setup cookies` works. - Unauthorized users cannot
manage cookies. - Valid Netscape format is accepted. - Invalid format is
rejected. - Cookies authentication validation works where possible. -
Cookies are passed to yt-dlp correctly. - Cookies can be replaced and
deleted. - Sensitive data never appears in logs or Discord. -
Authentication failures are handled correctly.

**REGRESSION:** - Existing `/upload` still works. - YouTube support
remains functional. - TikTok support remains functional. - SoundCloud
support remains functional. - Spotify resolution remains functional. -
MP3 192 kbps output remains functional. - Top4Top uploading remains
functional. - Configuration persists after restart.

Do not claim tests passed if they were not actually executed.

# 12. FINAL DELIVERABLES

After implementation, provide a concise report containing:

1.  Features implemented.
2.  Files created.
3.  Files modified.
4.  Dependencies added or changed.
5.  How to use `/setup`.
6.  How to use `/setup cookies`.
7.  How automatic yt-dlp updates work.
8.  Security considerations.
9.  Test results.
10. Any remaining limitations.

# FINAL INSTRUCTION

Implement all requested features in the existing project.

Do not stop after writing a plan.

Do not repeatedly inspect unchanged files.

Do not repeat the same analysis.

Prioritize efficient execution, clean architecture, security,
reliability, and preservation of existing functionality.
