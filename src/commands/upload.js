const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { runConversion, errorPayload } = require('../utils/convertFlow');
const { get } = require('../utils/configManager');
const { accent } = require('../utils/panelBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upload')
        .setDescription('Download audio from YouTube, TikTok, SoundCloud, or Spotify and upload to Top4Top')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Paste YouTube, TikTok, SoundCloud, or Spotify URL')
                .setRequired(true)),

    async execute(interaction) {
        // Ephemeral from the first acknowledgement: the deferred reply and every
        // later editReply inherit "Only you can see this".
        await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const url = interaction.options.getString('url');
        const config = interaction.guildId ? get(interaction.guildId) : null;

        try {
            await runConversion(interaction, url, { accentColor: config ? accent(config) : 0x3498db });
        } catch (error) {
            console.error(error);
            await interaction.editReply(errorPayload(error.message));
        }
    },
};
