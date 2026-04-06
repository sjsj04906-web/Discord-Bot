import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { getUserData, eraseUserData, getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const ADMIN_LOG_NAMES = ["admin-log", "adminlog", "server-log", "serverlog", "staff-log"];
const MOD_LOG_NAMES   = ["mod-log", "modlog", "mod-logs", "modlogs"];

async function findStaffChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | null> {
  const guild  = interaction.guild!;
  const config = await getGuildConfig(guild.id).catch(() => null);

  if (config?.adminLogChannelId) {
    const ch = guild.channels.cache.get(config.adminLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }
  if (config?.modLogChannelId) {
    const ch = guild.channels.cache.get(config.modLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  return (guild.channels.cache.find(
    (c) => [...ADMIN_LOG_NAMES, ...MOD_LOG_NAMES].some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

export const data = new SlashCommandBuilder()
  .setName("mydata")
  .setDescription("View or request erasure of data this bot holds about you (GDPR)")
  .addSubcommand((sub) =>
    sub.setName("view")
      .setDescription("See a summary of all data stored about you in this server")
  )
  .addSubcommand((sub) =>
    sub.setName("request")
      .setDescription("Submit a request to have your data permanently erased (reviewed by staff)")
  )
  .addSubcommand((sub) =>
    sub.setName("purge")
      .setDescription("(Staff) Immediately erase all data held about another user")
      .addUserOption((o) =>
        o.setName("user").setDescription("The user whose data should be erased").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /mydata view ─────────────────────────────────────────────────────────────
  if (sub === "view") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const stored = await getUserData(interaction.guild.id, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `🔒  Your Data  ·  ${BOT_NAME}` })
      .setTitle(`Data held about ${interaction.user.tag}`)
      .setDescription(
        "The following is a summary of all records this bot holds about you in this server. " +
        "Use `/mydata request` to submit an erasure request."
      )
      .addFields(
        { name: "Warnings",     value: String(stored.warnings.length),  inline: true },
        { name: "Staff Notes",  value: String(stored.notes.length),     inline: true },
        { name: "Case Records", value: String(stored.cases.length),     inline: true },
        { name: "Temp Bans",    value: String(stored.tempBans.length),  inline: true },
        { name: "Modmail",      value: String(stored.modmail.length),   inline: true },
        { name: "Tickets",      value: String(stored.tickets.length),   inline: true },
        { name: "Role Backup",  value: stored.roleBackup.length ? "1 record" : "None", inline: true },
      );

    if (stored.warnings.length > 0) {
      const recent = stored.warnings.slice(0, 3).map((w) =>
        `• <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:d>  ${w.reason}`
      ).join("\n");
      embed.addFields({ name: `Most Recent Warnings (${stored.warnings.length} total)`, value: recent });
    }

    if (stored.cases.length > 0) {
      const recent = stored.cases.slice(0, 3).map((c) =>
        `• <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:d>  ${c.actionType}  —  ${c.reason}`
      ).join("\n");
      embed.addFields({ name: `Most Recent Cases (${stored.cases.length} total)`, value: recent });
    }

    embed
      .addFields({
        name:  "What we store",
        value: "Discord user IDs, usernames, timestamps, and moderation action reasons. No email addresses, IP addresses, or personal information beyond what Discord provides.",
      })
      .setFooter({ text: `${BOT_NAME}  ·  GDPR Data Request` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /mydata request ───────────────────────────────────────────────────────────
  if (sub === "request") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const stored      = await getUserData(interaction.guild.id, interaction.user.id);
    const totalRecords = (
      stored.warnings.length + stored.notes.length + stored.cases.length +
      stored.tempBans.length + stored.modmail.length + stored.tickets.length +
      stored.roleBackup.length
    );

    // Find a staff channel to post the request
    const staffChannel = await findStaffChannel(interaction);

    const requestEmbed = new EmbedBuilder()
      .setColor(THEME.warn)
      .setAuthor({ name: `📋  GDPR Erasure Request  ·  ${BOT_NAME}` })
      .setTitle("Data Deletion Request")
      .setDescription(
        `${interaction.user} has submitted a request to have all their moderation records permanently deleted under GDPR Article 17 (Right to Erasure).\n\n` +
        `Review their record below before approving or denying. You must respond within **30 days**.`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: "User",         value: `${interaction.user} \`${interaction.user.tag}\``, inline: true },
        { name: "User ID",      value: `\`${interaction.user.id}\``, inline: true },
        { name: "Total Records",value: String(totalRecords), inline: true },
        { name: "Warnings",     value: String(stored.warnings.length), inline: true },
        { name: "Staff Notes",  value: String(stored.notes.length),    inline: true },
        { name: "Case Records", value: String(stored.cases.length),    inline: true },
        { name: "Temp Bans",    value: String(stored.tempBans.length), inline: true },
        { name: "Modmail",      value: String(stored.modmail.length),  inline: true },
        { name: "Tickets",      value: String(stored.tickets.length),  inline: true },
      )
      .setFooter({ text: "Approve to erase all records  ·  Deny to retain them with a reason" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mydata_approve_${interaction.user.id}_${interaction.guild.id}`)
        .setLabel("Approve — Erase Data")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mydata_deny_${interaction.user.id}_${interaction.guild.id}`)
        .setLabel("Deny — Retain Data")
        .setStyle(ButtonStyle.Secondary),
    );

    if (staffChannel) {
      await staffChannel.send({ embeds: [requestEmbed], components: [row] }).catch(() => {});
    }

    // Acknowledge the user
    const ackEmbed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `🔒  Erasure Request Received  ·  ${BOT_NAME}` })
      .setTitle("Your request has been submitted")
      .setDescription(
        `Your data erasure request for **${interaction.guild.name}** has been received and will be reviewed by the server staff.\n\n` +
        `You will be notified via DM once a decision has been made. Under GDPR, requests must be responded to within **30 days**.`
      )
      .addFields({ name: "Records in scope", value: String(totalRecords) })
      .setFooter({ text: `${BOT_NAME}  ·  GDPR Article 17` })
      .setTimestamp();

    await interaction.editReply({ embeds: [ackEmbed] });
    return;
  }

  // ── /mydata purge (staff only — immediate) ────────────────────────────────────
  if (sub === "purge") {
    const member  = interaction.guild.members.cache.get(interaction.user.id);
    const isStaff = interaction.guild.ownerId === interaction.user.id
      || member?.permissions.has(PermissionFlagsBits.ManageGuild);

    if (!isStaff) {
      await interaction.reply({
        content: "You need the **Manage Server** permission to purge another user's data.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const counts = await eraseUserData(interaction.guild.id, target.id);
    const total  = Object.values(counts).reduce((s, n) => s + n, 0);

    const embed = new EmbedBuilder()
      .setColor(THEME.warn)
      .setAuthor({ name: `🗑️  User Data Purged  ·  ${BOT_NAME}` })
      .setTitle(`Data erased for ${target.tag}`)
      .setDescription(
        `All moderation records for ${target} have been permanently deleted from **${interaction.guild.name}**. ` +
        `**${total} record${total !== 1 ? "s" : ""}** removed.`
      )
      .addFields(
        { name: "Warnings",    value: String(counts.warnings),    inline: true },
        { name: "Notes",       value: String(counts.notes),       inline: true },
        { name: "Cases",       value: String(counts.cases),       inline: true },
        { name: "Temp Bans",   value: String(counts.tempBans),    inline: true },
        { name: "Modmail",     value: String(counts.modmail),     inline: true },
        { name: "Tickets",     value: String(counts.tickets),     inline: true },
        { name: "Role Backup", value: String(counts.roleBackups), inline: true },
      )
      .setFooter({ text: `Approved by ${interaction.user.tag}  ·  ${BOT_NAME}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Attempt to DM the target
    const dmEmbed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🗑️  Data Erased  ·  ${BOT_NAME}` })
      .setTitle("Your data has been deleted")
      .setDescription(
        `Your moderation records in **${interaction.guild.name}** have been permanently erased. ` +
        `**${total} record${total !== 1 ? "s" : ""}** were removed.`
      )
      .setFooter({ text: `${BOT_NAME}  ·  GDPR Article 17` })
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});
  }
}
