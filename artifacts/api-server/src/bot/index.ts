import { Events, type Interaction } from "discord.js";
import { client, commands } from "./client.js";
import { allCommands } from "./commands/index.js";
import { handleAutoMod } from "./automod.js";
import { logger } from "../lib/logger.js";

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — Discord bot will not start");
    return;
  }

  for (const cmd of allCommands) {
    commands.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot ready");

    try {
      const commandData = allCommands.map((c) => c.data.toJSON());
      await readyClient.application.commands.set(commandData);
      logger.info({ count: commandData.length }, "Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ name: interaction.commandName }, "Unknown command received");
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Error executing command");
      const msg = { content: "An error occurred while running this command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    await handleAutoMod(message);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
  });
}
