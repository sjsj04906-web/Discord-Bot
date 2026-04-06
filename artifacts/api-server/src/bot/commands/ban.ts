import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";
import { randomBanLine } from "../utils/savagelines.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to ban").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the ban").setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName("delete_days")
      .setDescription("Days of messages to delete (0-7)")
      .setMinValue(0).setMaxValue(7).setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id)
    ?? await interaction.guild.members.fetch(target.id).catch(() => null);

  if (member && !member.bannable) {
    await interaction.reply({ content: "I don't have permission to ban this member.", ephemeral: true });
    return;
  }

  // Strip all non-@everyone roles before banning
  const strippedRoles: string[] = [];
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== interaction.guild!.id);
    strippedRoles.push(...roles.map((r) => `<@&${r.id}>`));
    await member.roles.set([], `Pre-ban role strip — banned by ${interaction.user.tag}`).catch(() => {});
  }

  try {
    await interaction.guild.members.ban(target, {
      reason: `${reason} — banned by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86400,
    });

    const embed = new EmbedBuilder()
      .setColor(THEME.ban)
      .setAuthor({ name: `⛔  Member Banned  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setDescription(`*${randomBanLine()}*`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Member",    value: `${target}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
      )
      .addFields({ name: "Reason", value: reason });

    if (strippedRoles.length > 0) {
      embed.addFields({ name: "Roles Stripped", value: strippedRoles.join(" ") });
    }
    if (deleteDays > 0) {
      embed.addFields({ name: "Message History", value: `${deleteDays} day(s) deleted`, inline: true });
    }

    embed.setFooter({ text: `ID: ${target.id}` }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.ban(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "⛔  Member Banned",
      color: THEME.ban,
      target,
      moderator: interaction.user,
      reason,
      extra: deleteDays > 0 ? { "Message History Deleted": `${deleteDays} day(s)` } : undefined,
      adminOnly: true,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to ban member: ${String(err)}`, ephemeral: true });
  }
}
