import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { warnings } from "../warnings.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View warning history for a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to check").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const key = `${interaction.guild.id}:${target.id}`;
  const userWarnings = warnings.get(key) ?? [];

  if (userWarnings.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // NO VIOLATIONS ON RECORD")
      .setDescription(`${target} has a clean record.`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.warnings)
    .setTitle(`⚠️ // VIOLATION LOG: ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`**${userWarnings.length}** violation(s) on record`)
    .setTimestamp();

  for (const [i, w] of userWarnings.slice(-10).entries()) {
    embed.addFields({
      name: `#${i + 1}  •  ${new Date(w.timestamp).toLocaleDateString()}`,
      value: `**Reason:** ${w.reason}\n**By:** \`${w.moderator}\``,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
