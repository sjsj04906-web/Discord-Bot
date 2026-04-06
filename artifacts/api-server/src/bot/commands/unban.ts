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
  .setName("unban")
  .setDescription("Unban a user from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption((o) =>
    o.setName("user_id").setDescription("The ID of the user to unban").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the unban").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.options.getString("user_id", true).trim();
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  try {
    const ban = await interaction.guild.bans.fetch(userId);
    await interaction.guild.members.unban(userId, `${reason} | Unbanned by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(THEME.unban)
      .setTitle("🔓 // ACCESS RESTORED")
      .setThumbnail(ban.user.displayAvatarURL())
      .addFields(
        { name: "TARGET", value: `\`${ban.user.tag}\``, inline: true },
        { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        { name: "REASON", value: reason },
      )
      .setFooter({ text: `ID: ${userId}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.unban(ban.user.tag, interaction.guild.name);

    await sendModLog(interaction.guild, {
      action: "🔓 UNBAN // ACCESS RESTORED",
      color: THEME.unban,
      target: ban.user,
      moderator: interaction.user,
      reason,
    });
  } catch {
    await interaction.reply({ content: `No ban record found for \`${userId}\`.`, ephemeral: true });
  }
}
