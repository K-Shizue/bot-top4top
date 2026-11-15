const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const configManager = require('../utils/configManager');
const { dashboardPayload, cookiesPayload, notice } = require('../utils/panelBuilder');
const cookiesManager = require('../utils/cookiesManager');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function isCookieAdmin(interaction) {
    const allowed = new Set(String(process.env.COOKIE_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
    const app = interaction.client.application;
    const ownerId = app?.owner?.ownerId || app?.owner?.id;
    if (ownerId) allowed.add(ownerId);
    return allowed.has(interaction.user.id);
}

module.exports = {
    isCookieAdmin,
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure the converter panel and manage global cookies')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('Open the panel configuration dashboard'))
        .addSubcommand(sub => sub
            .setName('cookies')
            .setDescription('Manage global cookies.txt (bot owner / authorized admins)')
            .addAttachmentOption(option => option
                .setName('file')
                .setDescription('cookies.txt in Netscape HTTP Cookie File format')
                .setRequired(false))),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'cookies') {
            if (!isCookieAdmin(interaction)) {
                return interaction.reply(notice('## 🔒 Not Authorized\nGlobal cookies can only be managed by the bot owner or explicitly authorized administrators.', 0xe74c3c));
            }

            const attachment = interaction.options.getAttachment('file');
            if (!attachment) return interaction.reply(cookiesPayload(cookiesManager.status()));

            await interaction.deferReply({ flags: EPHEMERAL_V2 });
            try {
                if (!/\.txt$/i.test(attachment.name || '')) throw new Error('Attachment must be a .txt file.');
                if (attachment.size > cookiesManager.MAX_SIZE) throw new Error('Attachment exceeds the 1 MB limit.');
                const res = await fetch(attachment.url);
                if (!res.ok) throw new Error(`Could not download attachment (HTTP ${res.status}).`);
                cookiesManager.save(Buffer.from(await res.arrayBuffer()));
                return interaction.editReply(cookiesPayload(cookiesManager.status()));
            } catch (err) {
                return interaction.editReply(notice(`## ❌ Cookies Upload Rejected\n${err.message}`, 0xe74c3c));
            }
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply(notice('## 🔒 Manage Server permission required', 0xe74c3c));
        }

        return interaction.reply(dashboardPayload(configManager.get(interaction.guildId), 'general'));
    },
};
