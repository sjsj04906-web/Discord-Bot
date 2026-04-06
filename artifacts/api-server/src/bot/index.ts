import { Events, type Interaction } from "discord.js";
import { client, commands } from "./client.js";
import { allCommands } from "./commands/index.js";
import { handleAutoMod } from "./automod.js";
import { printBanner, log } from "./display.js";
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
    const totalMembers = readyClient.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

    try {
      const commandData = allCommands.map((c) => c.data.toJSON());
      await readyClient.application.commands.set(commandData);
      printBanner(
        readyClient.user.tag,
        readyClient.guilds.cache.size,
        totalMembers,
        commandData.length,
      );
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    log.command(interaction.commandName, interaction.user.tag, interaction.guild?.name ?? "DM");

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error(`Command /${interaction.commandName} failed: ${String(err)}`);
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

  client.on(Events.GuildMemberAdd, (member) => {
    log.join(member.user.tag, member.guild.name);
  });

  client.on(Events.Error, (err) => {
    log.error(String(err));
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
  });
}
