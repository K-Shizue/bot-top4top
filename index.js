require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const interactionHandler = require('./src/handlers/interactionHandler');
const ytdlpUpdater = require('./src/utils/ytdlpUpdater');
const { applyPresence } = require('./src/utils/presence');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'src', 'commands');
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath, { recursive: true });
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandsToRegister = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsToRegister.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Presence is re-applied after gateway reconnects; setPresence is idempotent.
client.on('shardResume', () => applyPresence(client));

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    applyPresence(client);

    try {
        await client.application.fetch();
    } catch (error) {
        console.warn(`[setup] Could not fetch application owner: ${error.message}`);
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log(`Started refreshing ${commandsToRegister.length} application (/) commands.`);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsToRegister },
        );
        console.log(`Successfully reloaded ${commandsToRegister.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }

    ytdlpUpdater.startScheduler();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) {
        try {
            await interactionHandler.handle(interaction);
        } catch (error) {
            console.error(error);
            const payload = {
                flags: 32768 | 64,
                components: [{
                    type: 17,
                    accent_color: 0xe74c3c,
                    components: [
                        { type: 10, content: '## ❌ Interaction Error' },
                        { type: 14, divider: true },
                        { type: 10, content: 'This interaction could not be completed.' }
                    ]
                }]
            };
            try {
                if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
                else await interaction.reply(payload);
            } catch {}
        }
        return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        const errorContainer = {
            type: 17,
            accent_color: 0xe74c3c,
            components: [
                { type: 10, content: '## ❌ Execution Error' },
                { type: 14, divider: true },
                { type: 10, content: 'There was an unexpected error while executing this command!' }
            ]
        };
        const errorPayload = {
            flags: 32768 | 64,
            components: [errorContainer]
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload);
        } else {
            await interaction.reply(errorPayload);
        }
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error("Error: DISCORD_TOKEN not found in environment variables.");
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
