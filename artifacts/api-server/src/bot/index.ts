import { Events, type Interaction, type GuildMember, PermissionFlagsBits, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
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
import { handleMemberJoinLog, handleMemberLeaveLog } from "./events/joinLeaveLog.js";
import { startReminderScheduler } from "./reminderScheduler.js";
import { startInterestScheduler } from "./interestScheduler.js";
import { handleXp } from "./events/xpHandler.js";
import { handleCounting } from "./events/counting.js";
import { handleAntiNukeRoleDelete, handleAntiNukeChannelDelete, handleAntiNukeBanAdd } from "./events/antiNuke.js";
import { handleWelcome } from "./events/welcome.js";
import { handleBlackjackButton } from "./commands/gamble.js";
import { handleHeistJoin } from "./commands/heist.js";
import { getSuggestion, updateSuggestionStatus } from "./db.js";
import { applySuggestionVerdict } from "./commands/suggestion.js";
import { handleSuggestionMessage, handleSuggestionThread } from "./events/suggestions.js";
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
import { startRetentionScheduler } from "./retentionScheduler.js";
import { getCommandRoles, getGuildConfig, eraseUserData } from "./db.js";
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
    startRetentionScheduler();
    startServerStatsScheduler(readyClient);
    startReminderScheduler(readyClient);
    startInterestScheduler(readyClient);
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

    // ── GDPR erasure request — Approve ───────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("mydata_approve_")) {
      const [, , userId, guildId] = interaction.customId.split("_");
      if (!interaction.guild || !userId || !guildId) return;

      const staffMember = interaction.guild.members.cache.get(interaction.user.id);
      const isStaff = interaction.guild.ownerId === interaction.user.id
        || staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!isStaff) {
        await interaction.reply({ content: "You need **Manage Server** to action this request.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferUpdate();
      const counts = await eraseUserData(guildId, userId);
      const total  = Object.values(counts).reduce((s, n) => s + n, 0);

      const done = new EmbedBuilder()
        .setColor(THEME.success)
        .setAuthor({ name: `✅  Erasure Approved  ·  ${BOT_NAME}` })
        .setDescription(`**${total} record${total !== 1 ? "s" : ""}** permanently deleted for user \`${userId}\`.`)
        .setFooter({ text: `Approved by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [...(interaction.message.embeds ?? []), done], components: [] });

      // DM the requester
      const target = await interaction.client.users.fetch(userId).catch(() => null);
      if (target) {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.success)
              .setAuthor({ name: `✅  Erasure Request Approved  ·  ${BOT_NAME}` })
              .setTitle("Your data has been deleted")
              .setDescription(`Your data erasure request for **${interaction.guild.name}** has been approved. **${total} record${total !== 1 ? "s" : ""}** were permanently removed.`)
              .setFooter({ text: `${BOT_NAME}  ·  GDPR Article 17` })
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
      return;
    }

    // ── GDPR erasure request — Deny ───────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("mydata_deny_")) {
      const [, , userId, guildId] = interaction.customId.split("_");
      if (!interaction.guild || !userId || !guildId) return;

      const staffMember = interaction.guild.members.cache.get(interaction.user.id);
      const isStaff = interaction.guild.ownerId === interaction.user.id
        || staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!isStaff) {
        await interaction.reply({ content: "You need **Manage Server** to action this request.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferUpdate();

      const done = new EmbedBuilder()
        .setColor(THEME.ban)
        .setAuthor({ name: `❌  Erasure Denied  ·  ${BOT_NAME}` })
        .setDescription(`Erasure request for user \`${userId}\` was denied. Records retained.`)
        .setFooter({ text: `Denied by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [...(interaction.message.embeds ?? []), done], components: [] });

      // DM the requester
      const target = await interaction.client.users.fetch(userId).catch(() => null);
      if (target) {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.ban)
              .setAuthor({ name: `❌  Erasure Request Denied  ·  ${BOT_NAME}` })
              .setTitle("Your request has been reviewed")
              .setDescription(
                `Your data erasure request for **${interaction.guild.name}** has been reviewed and denied.\n\n` +
                `Your moderation records will be retained. Under GDPR, you have the right to lodge a complaint ` +
                `with your national data protection authority if you believe this decision is unlawful.`
              )
              .setFooter({ text: `${BOT_NAME}  ·  GDPR Article 17` })
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
      return;
    }

    // ── Ban appeal — button (show modal) ─────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("ban_appeal_")) {
      const guildId = interaction.customId.replace("ban_appeal_", "");
      const modal = new ModalBuilder()
        .setCustomId(`ban_appeal_modal_${guildId}`)
        .setTitle("Ban Appeal");
      const textInput = new TextInputBuilder()
        .setCustomId("ban_appeal_text")
        .setLabel("Explain why this ban should be reversed")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Be clear and honest. Staff review all appeals.")
        .setMinLength(20)
        .setMaxLength(1000)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
      await interaction.showModal(modal);
      return;
    }

    // ── Ban appeal — modal submit ─────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ban_appeal_modal_")) {
      const guildId  = interaction.customId.replace("ban_appeal_modal_", "");
      const text     = interaction.fields.getTextInputValue("ban_appeal_text");
      const userId   = interaction.user.id;
      const userTag  = interaction.user.tag;

      await interaction.reply({ content: "✅ Your appeal has been submitted. Staff will review it.", flags: MessageFlags.Ephemeral });

      // Find the guild and post to admin/mod log
      const targetGuild = interaction.client.guilds.cache.get(guildId);
      if (!targetGuild) return;

      const config = await import("./db.js").then((m) => m.getGuildConfig(guildId)).catch(() => null);
      const logChannelId = config?.adminLogChannelId || config?.modLogChannelId || "";
      const FALLBACK = ["admin-log", "adminlog", "mod-log", "modlog"];
      const logCh = (logChannelId && targetGuild.channels.cache.get(logChannelId)?.isTextBased()
        ? targetGuild.channels.cache.get(logChannelId)
        : targetGuild.channels.cache.find(
            (c) => FALLBACK.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
          )) as import("discord.js").TextChannel | undefined;

      if (!logCh) return;

      const appealEmbed = new EmbedBuilder()
        .setColor(THEME.warn)
        .setAuthor({ name: `📝  Ban Appeal Received  ·  ${BOT_NAME}` })
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "User",    value: `${userTag} \`${userId}\``, inline: true },
          { name: "Server",  value: targetGuild.name, inline: true },
          { name: "Appeal",  value: text.slice(0, 1024) },
        )
        .setFooter({ text: `User ID: ${userId}` })
        .setTimestamp();

      await logCh.send({ embeds: [appealEmbed] }).catch(() => {});
      return;
    }

    // ── Blackjack buttons ─────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("bj_hit_")) {
      await handleBlackjackButton(interaction, "hit");
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("bj_stand_")) {
      await handleBlackjackButton(interaction, "stand");
      return;
    }

    // ── Heist join button ─────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("heist_join_")) {
      const guildId = interaction.customId.replace("heist_join_", "");
      await handleHeistJoin(interaction, guildId);
      return;
    }

    // ── Suggestion approve/deny buttons → show modal ──────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("suggest_approve_btn_")) {
      if (!interaction.guild) return;
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const isStaff = interaction.guild.ownerId === interaction.user.id
        || member?.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!isStaff) {
        await interaction.reply({ content: "You need **Manage Server** to review suggestions.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = interaction.customId.replace("suggest_approve_btn_", "");
      const modal = new ModalBuilder()
        .setCustomId(`suggest_approve_modal_${id}`)
        .setTitle(`Approve Suggestion #${id}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(300)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("suggest_deny_btn_")) {
      if (!interaction.guild) return;
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const isStaff = interaction.guild.ownerId === interaction.user.id
        || member?.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!isStaff) {
        await interaction.reply({ content: "You need **Manage Server** to review suggestions.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = interaction.customId.replace("suggest_deny_btn_", "");
      const modal = new ModalBuilder()
        .setCustomId(`suggest_deny_modal_${id}`)
        .setTitle(`Deny Suggestion #${id}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(300)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // ── Suggestion modals submit ───────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("suggest_approve_modal_")) {
      const id    = Number(interaction.customId.replace("suggest_approve_modal_", ""));
      const reason = interaction.fields.getTextInputValue("reason");
      const sugg  = await getSuggestion(id);
      await applySuggestionVerdict(interaction, sugg, "approve", reason);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("suggest_deny_modal_")) {
      const id    = Number(interaction.customId.replace("suggest_deny_modal_", ""));
      const reason = interaction.fields.getTextInputValue("reason");
      const sugg  = await getSuggestion(id);
      await applySuggestionVerdict(interaction, sugg, "deny", reason);
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

    // ── Suggestion channel: intercept and convert to suggestion embed ─────────
    const suggConfig = await getGuildConfig(message.guildId).catch(() => null);
    if (suggConfig?.suggestionChannelId && message.channelId === suggConfig.suggestionChannelId) {
      await handleSuggestionMessage(message);
      return;
    }

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
    await handleXp(message);
    await handleCounting(message);
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
    await handleMemberJoinLog(member as GuildMember);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    log.leave(member.user.tag, member.guild.name);
    await handleMemberLeaveLog(member);
    if (member.partial) return;
    await handleMemberLeave(member);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await handleDehoist(newMember);
    await handleAdminMemberUpdate(oldMember, newMember);
    if (oldMember.partial || newMember.partial) return;
    await handleMemberUpdate(oldMember, newMember);
  });

  client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
    await handleSuggestionThread(thread, newlyCreated);
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
    await handleAntiNukeChannelDelete(channel as import("discord.js").GuildChannel);
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
    await handleAntiNukeRoleDelete(role);
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    await handleAntiNukeBanAdd(ban.guild);
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
