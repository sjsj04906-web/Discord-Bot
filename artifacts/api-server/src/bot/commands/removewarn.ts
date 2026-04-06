import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings, removeWarning } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("removewarn")
  .setDescription("Remove a specific warning from a member's record")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user whose warning to remove").setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName("number").setDescription("Warning number to remove (use /warnings to see the list)").setRequired(true).setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const number = interaction.options.getInteger("number", true);

  const userWarnings = await getWarnings(interaction.guild.id, target.id);

  if (userWarnings.length === 0) {
    await interaction.reply({ content: `${target.tag} has no warnings on record.`, ephemeral: true });
    return;
  }

  const warning = userWarnings[number - 1];
  if (!warning) {
    await interaction.reply({
      content: `Warning #${number} doesn't exist. ${target.tag} has ${userWarnings.length} warning(s) — use \`/warnings\` to see them.`,
      ephemeral: true,
    });
    return;
  }

  await removeWarning(warning.id, interaction.guild.id);

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setTitle("✅ // WARNING REMOVED")
    .addFields(
      { name: "USER",      value: `${target} \`${target.tag}\``, inline: true },
      { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
      { name: "REMOVED",   value: `Warning #${number}`, inline: true },
      { name: "REASON",    value: warning.reason },
      { name: "REMAINING", value: `${userWarnings.length - 1} warning(s)`, inline: true },
    )
    .setFooter({ text: `ID: ${target.id}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
