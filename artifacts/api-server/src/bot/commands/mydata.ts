import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { getUserData, eraseUserData } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("mydata")
  .setDescription("View or erase the data this bot holds about you (GDPR)")
  .addSubcommand((sub) =>
    sub.setName("view")
      .setDescription("See a summary of all data stored about you in this server")
  )
  .addSubcommand((sub) =>
    sub.setName("delete")
      .setDescription("Permanently erase all data this bot holds about you in this server")
  )
  .addSubcommand((sub) =>
    sub.setName("purge")
      .setDescription("(Staff) Erase all data held about another user")
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

    const data = await getUserData(interaction.guild.id, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `🔒  Your Data  ·  ${BOT_NAME}` })
      .setTitle(`Data held about ${interaction.user.tag}`)
      .setDescription(
        "The following is a summary of all records this bot holds about you in this server. " +
        "Use `/mydata delete` to request erasure."
      )
      .addFields(
        { name: "Warnings",       value: String(data.warnings.length),  inline: true },
        { name: "Staff Notes",    value: String(data.notes.length),     inline: true },
        { name: "Case Records",   value: String(data.cases.length),     inline: true },
        { name: "Temp Bans",      value: String(data.tempBans.length),  inline: true },
        { name: "Modmail",        value: String(data.modmail.length),   inline: true },
        { name: "Tickets",        value: String(data.tickets.length),   inline: true },
        { name: "Role Backup",    value: data.roleBackup.length ? "1 record" : "None", inline: true },
      );

    if (data.warnings.length > 0) {
      const recent = data.warnings.slice(0, 3).map((w) =>
        `• <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:d>  ${w.reason}`
      ).join("\n");
      embed.addFields({ name: `Most Recent Warnings (${data.warnings.length} total)`, value: recent });
    }

    if (data.cases.length > 0) {
      const recent = data.cases.slice(0, 3).map((c) =>
        `• <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:d>  ${c.actionType}  —  ${c.reason}`
      ).join("\n");
      embed.addFields({ name: `Most Recent Cases (${data.cases.length} total)`, value: recent });
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

  // ── /mydata delete ───────────────────────────────────────────────────────────
  if (sub === "delete") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const counts = await eraseUserData(interaction.guild.id, interaction.user.id);
    const total  = Object.values(counts).reduce((s, n) => s + n, 0);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🗑️  Data Erased  ·  ${BOT_NAME}` })
      .setTitle("Your data has been permanently deleted")
      .setDescription(
        `All moderation records held about you in **${interaction.guild.name}** have been erased. ` +
        `A total of **${total} record${total !== 1 ? "s" : ""}** were removed.`
      )
      .addFields(
        { name: "Warnings",     value: String(counts.warnings),   inline: true },
        { name: "Notes",        value: String(counts.notes),      inline: true },
        { name: "Cases",        value: String(counts.cases),      inline: true },
        { name: "Temp Bans",    value: String(counts.tempBans),   inline: true },
        { name: "Modmail",      value: String(counts.modmail),    inline: true },
        { name: "Tickets",      value: String(counts.tickets),    inline: true },
        { name: "Role Backup",  value: String(counts.roleBackups), inline: true },
      )
      .setFooter({ text: `${BOT_NAME}  ·  GDPR Erasure Request` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /mydata purge (staff only) ───────────────────────────────────────────────
  if (sub === "purge") {
    const member = interaction.guild.members.cache.get(interaction.user.id);
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
        { name: "Warnings",     value: String(counts.warnings),    inline: true },
        { name: "Notes",        value: String(counts.notes),       inline: true },
        { name: "Cases",        value: String(counts.cases),       inline: true },
        { name: "Temp Bans",    value: String(counts.tempBans),    inline: true },
        { name: "Modmail",      value: String(counts.modmail),     inline: true },
        { name: "Tickets",      value: String(counts.tickets),     inline: true },
        { name: "Role Backup",  value: String(counts.roleBackups), inline: true },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}  ·  ${BOT_NAME}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
