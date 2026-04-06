import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { warnings } from "../warnings.js";

export const data = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View warnings for a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to check").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const key = `${interaction.guild.id}:${target.id}`;
  const userWarnings = warnings.get(key) ?? [];

  if (userWarnings.length === 0) {
    await interaction.reply({
      content: `✅ **${target.tag}** has no warnings.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Warnings for ${target.tag}`)
    .setColor(0xffa500)
    .setDescription(`Total warnings: **${userWarnings.length}**`)
    .setTimestamp();

  for (const [i, w] of userWarnings.slice(-10).entries()) {
    embed.addFields({
      name: `#${i + 1} — ${new Date(w.timestamp).toLocaleDateString()}`,
      value: `**Reason:** ${w.reason}\n**By:** ${w.moderator}`,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
