import { Events, type Interaction, type GuildMember, PermissionFlagsBits, EmbedBuilder, MessageFlags } from "discord.js";
import { client, commands } from "./client.js";
import { allCommands } from "./commands/index.js";
import { handleAutoMod } from "./automod.js";
import { handleMessageDelete, handleMessageUpdate, handleMessageBulkDelete } from "./events/messageLog.js";
import { handleHarassmentDetection } from "./harassment.js";
import { handleAntiRaid } from "./events/antiRaid.js";
import { handleNewAccount, handleDehoist, handleRoleRestore } from "./events/memberJoin.js";
import { handleMemberLeave } from "./events/memberLeave.js";
import { handleMemberUpdate } from "./events/memberUpdate.js";
import { handleAntiGhostping } from "./events/antiGhostping.js";
import { handleDirectMessage, handleModMailReply, handleModMailButtonInteraction } from "./events/modmail.js";
import { handleVoiceStateUpdate } from "./events/voiceLog.js";
import { handleWelcome } from "./events/welcome.js";
import { handleReactionAdd, handleReactionRemove } from "./events/reactionRoles.js";
import { initInviteTracker, handleInviteCreate, handleInviteDelete, handleInviteJoin } from "./events/inviteTracker.js";
import {
  handleChannelCreate, handleChannelDelete, handleChannelUpdate,
  handleRoleCreate, handleRoleDelete, handleRoleUpdate,
  handleAdminMemberUpdate, handleGuildUpdate,
} from "./events/adminLog.js";
import { startServerStatsScheduler } from "./commands/serverstats.js";
import { printBanner, log } from "./display.js";
import { startStatusRotation } from "./statusRotation.js";
import { restorePendingTempBans } from "./tempbanScheduler.js";
import { restorePendingTempRoles } from "./temproleScheduler.js";
import { startWarnExpiryScheduler } from "./warnExpiryScheduler.js";
import { getCommandRoles, getGuildConfig } from "./db.js";
import { clearAfk, getAfk, isAfk } from "./utils/afkStore.js";
import { logger } from "../lib/logger.js";
import { THEME, BOT_NAME } from "./theme.js";

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
    startServerStatsScheduler(readyClient);
    await initInviteTracker(readyClient);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // ── Mod mail choice buttons ──────────────────────────────────────────────
    if (interaction.isButton() && (interaction.customId === "modmail_anon" || interaction.customId === "modmail_open")) {
      await handleModMailButtonInteraction(interaction);
      return;
    }

    // ── Verification gate button ─────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === "verify_gate") {
      if (!interaction.guild) return;
      const config = await getGuildConfig(interaction.guild.id).catch(() => null);
      if (!config?.verifyRoleId) {
        await interaction.reply({ content: "Verification is not configured.", flags: MessageFlags.Ephemeral });
        return;
      }
      const member = interaction.guild.members.cache.get(interaction.user.id)
        ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "Could not find your member record.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (member.roles.cache.has(config.verifyRoleId)) {
        await interaction.reply({ content: "You are already verified.", flags: MessageFlags.Ephemeral });
        return;
      }
      await member.roles.add(config.verifyRoleId, "Verification gate").catch(() => {});
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.success)
            .setAuthor({ name: `✅  Verified  ·  ${BOT_NAME}` })
            .setDescription(`Welcome to **${interaction.guild.name}**! You now have full access.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    const channelId = packet.d["channel_id"] as string;
    const messageId = packet.d["id"] as string;

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
    if (!message.guildId || !message.guild || message.author.bot) return;

    // ── AFK: clear status if AFK user sends a message ────────────────────────
    if (isAfk(message.guildId, message.author.id)) {
      const afkData = clearAfk(message.guildId, message.author.id);
      if (afkData) {
        const reply = await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.success)
              .setDescription(`👋 Welcome back, ${message.author}! Your AFK has been cleared.`),
          ],
        }).catch(() => null);
        if (reply) setTimeout(() => reply.delete().catch(() => {}), 8_000);
      }
    }

    // ── AFK: notify when an AFK user is mentioned ────────────────────────────
    if (message.mentions.users.size > 0) {
      const afkMentions: string[] = [];
      for (const user of message.mentions.users.values()) {
        const afkData = getAfk(message.guildId, user.id);
        if (afkData) {
          const since = Math.floor(afkData.setAt.getTime() / 1000);
          afkMentions.push(`💤 **${user.tag}** is AFK: *${afkData.reason}* (<t:${since}:R>)`);
        }
      }
      if (afkMentions.length > 0) {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.muted)
              .setDescription(afkMentions.join("\n")),
          ],
        }).catch(() => {});
      }
    }

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

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    if (channel.isDMBased()) return;
    await handleMessageBulkDelete(messages as Parameters<typeof handleMessageBulkDelete>[0], channel as import("discord.js").TextChannel);
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
    await handleInviteJoin(member as GuildMember);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    log.leave(member.user.tag, member.guild.name);
    if (member.partial) return;
    await handleMemberLeave(member);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await handleDehoist(newMember);
    await handleAdminMemberUpdate(oldMember, newMember);
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

  // ── Admin log events ─────────────────────────────────────────────────────────
  client.on(Events.ChannelCreate, async (channel) => {
    if (channel.isDMBased()) return;
    await handleChannelCreate(channel as import("discord.js").GuildChannel);
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (channel.isDMBased()) return;
    await handleChannelDelete(channel as import("discord.js").GuildChannel);
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (oldChannel.isDMBased() || newChannel.isDMBased()) return;
    await handleChannelUpdate(
      oldChannel as import("discord.js").GuildChannel,
      newChannel as import("discord.js").GuildChannel,
    );
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    await handleRoleCreate(role);
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    await handleRoleDelete(role);
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    await handleRoleUpdate(oldRole, newRole);
  });

  client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    await handleGuildUpdate(oldGuild, newGuild);
  });

  client.on(Events.InviteCreate, (invite) => {
    handleInviteCreate(invite);
  });

  client.on(Events.InviteDelete, (invite) => {
    handleInviteDelete(invite);
  });

  client.on(Events.Error, (err) => {
    log.error(String(err));
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
  });
}
