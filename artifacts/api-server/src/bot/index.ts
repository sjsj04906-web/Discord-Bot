import { Events, type Interaction, PermissionFlagsBits } from "discord.js";
import { client, commands } from "./client.js";
import { allCommands } from "./commands/index.js";
import { handleAutoMod } from "./automod.js";
import { handleMessageDelete, handleMessageUpdate } from "./events/messageLog.js";
import { handleHarassmentDetection } from "./harassment.js";
import { handleAntiRaid } from "./events/antiRaid.js";
import { handleNewAccount, handleDehoist, handleAutoRole, handleRoleRestore } from "./events/memberJoin.js";
import { handleMemberLeave } from "./events/memberLeave.js";
import { handleMemberUpdate } from "./events/memberUpdate.js";
import { handleAntiGhostping } from "./events/antiGhostping.js";
import { handleDirectMessage, handleModMailReply } from "./events/modmail.js";
import { handleVoiceStateUpdate } from "./events/voiceLog.js";
import { handleWelcome } from "./events/welcome.js";
import { handleReactionAdd, handleReactionRemove } from "./events/reactionRoles.js";
import { printBanner, log } from "./display.js";
import { startStatusRotation } from "./statusRotation.js";
import { restorePendingTempBans } from "./tempbanScheduler.js";
import { restorePendingTempRoles } from "./temproleScheduler.js";
import { startWarnExpiryScheduler } from "./warnExpiryScheduler.js";
import { getCommandRoles } from "./db.js";
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
      printBanner(readyClient.user.tag, readyClient.guilds.cache.size, totalMembers, commandData.length);
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }

    startStatusRotation(readyClient);
    await restorePendingTempBans(readyClient);
    await restorePendingTempRoles(readyClient);
    startWarnExpiryScheduler();
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    log.command(interaction.commandName, interaction.user.tag, interaction.guild?.name ?? "DM");

    // ── Role permission check ────────────────────────────────────────────────
    if (interaction.guild) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const isOwner = interaction.guild.ownerId === interaction.user.id;
      const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

      if (!isOwner && !isAdmin) {
        const allowedRoles = await getCommandRoles(interaction.guild.id, interaction.commandName);
        if (allowedRoles.length > 0) {
          const hasRole = member?.roles.cache.some((r) => allowedRoles.includes(r.id)) ?? false;
          if (!hasRole) {
            await interaction.reply({
              content: `🔒 You don't have the required role to use \`/${interaction.commandName}\`.`,
              ephemeral: true,
            });
            return;
          }
        }
      }
    }

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

  // Raw WS listener — Discord.js drops MessageCreate for uncached DM channels,
  // so we handle DMs here by fetching the full message directly from the API.
  client.on("raw" as never, async (packet: { t: string; d: Record<string, unknown> }) => {
    if (packet.t !== "MESSAGE_CREATE" || packet.d["guild_id"]) return;

    const channelId  = packet.d["channel_id"] as string;
    const messageId  = packet.d["id"] as string;
    const authorData = packet.d["author"] as Record<string, unknown> | undefined;
    console.log(`[raw-dm] DM received — channel=${channelId} author=${authorData?.["username"]}`);

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await (channel as import("discord.js").TextChannel).messages.fetch(messageId);
      await handleDirectMessage(message);
    } catch (err) {
      console.error("[raw-dm] failed to fetch and handle DM:", err);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    // DMs are handled via the raw listener above; only process guild messages here
    if (!message.guildId) return;

    // ── Mod mail: mod-channel reply forwarding ───────────────────────────────
    await handleModMailReply(message);

    // ── Normal guild message processing ─────────────────────────────────────
    await handleAutoMod(message);
    await handleHarassmentDetection(message);
  });

  client.on(Events.MessageDelete, async (message) => {
    await handleAntiGhostping(message);
    await handleMessageDelete(message);
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await handleMessageUpdate(oldMessage, newMessage);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    log.join(member.user.tag, member.guild.name);
    await handleAntiRaid(member);
    await handleNewAccount(member);
    await handleDehoist(member);
    await handleWelcome(member);
    await handleRoleRestore(member);
    await handleAutoRole(member);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    log.leave(member.user.tag, member.guild.name);
    if (member.partial) return;
    await handleMemberLeave(member);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await handleDehoist(newMember);
    if (oldMember.partial || newMember.partial) return;
    await handleMemberUpdate(oldMember, newMember);
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await handleVoiceStateUpdate(oldState, newState);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleReactionAdd(reaction, user);
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    await handleReactionRemove(reaction, user);
  });

  client.on(Events.Error, (err) => {
    log.error(String(err));
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
  });
}
