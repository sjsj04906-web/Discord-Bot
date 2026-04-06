import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME } from "../theme.js";

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

  const member = interaction.guild.members.cache.get(target.id);
  if (member && !member.bannable) {
    await interaction.reply({ content: "Cannot ban this entity — insufficient clearance.", ephemeral: true });
    return;
  }

  try {
    await interaction.guild.members.ban(target, {
      reason: `${reason} | Banned by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86400,
    });

    const embed = new EmbedBuilder()
      .setColor(THEME.ban)
      .setTitle("💀 // ENTITY BANNED")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "TARGET", value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        { name: "REASON", value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.ban(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "💀 BAN // ENTITY REMOVED",
      color: THEME.ban,
      target,
      moderator: interaction.user,
      reason,
      extra: deleteDays > 0 ? { "MESSAGES PURGED": `${deleteDays} day(s)` } : undefined,
    });
  } catch (err) {
    await interaction.reply({ content: `Execution failed: ${String(err)}`, ephemeral: true });
  }
}
