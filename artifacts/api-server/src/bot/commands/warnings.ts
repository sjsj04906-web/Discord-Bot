import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings, clearWarnings } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View or clear warning history for a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to check").setRequired(true)
  )
  .addBooleanOption((o) =>
    o.setName("clear").setDescription("Clear all warnings for this user").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const shouldClear = interaction.options.getBoolean("clear") ?? false;

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  if (shouldClear) {
    await clearWarnings(interaction.guild.id, target.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("✅ // RECORD WIPED")
          .setDescription(`All warnings cleared for ${target}.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  const userWarnings = await getWarnings(interaction.guild.id, target.id);

  if (userWarnings.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("✅ // NO VIOLATIONS ON RECORD")
          .setDescription(`${target} has a clean record.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.warnings)
    .setTitle(`⚠️ // VIOLATION LOG: ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`**${userWarnings.length}** violation(s) on record`)
    .setTimestamp();

  for (const [i, w] of userWarnings.slice(0, 10).entries()) {
    embed.addFields({
      name: `#${i + 1}  •  ${w.createdAt.toLocaleDateString()}`,
      value: `**Reason:** ${w.reason}\n**By:** \`${w.moderatorTag}\``,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
