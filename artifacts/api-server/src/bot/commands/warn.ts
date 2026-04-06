import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { warnings } from "../warnings.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to warn").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the warning").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const key = `${interaction.guild.id}:${target.id}`;
  const existing = warnings.get(key) ?? [];
  const newWarning = {
    reason,
    moderator: interaction.user.tag,
    timestamp: new Date().toISOString(),
  };
  existing.push(newWarning);
  warnings.set(key, existing);

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Warning Issued")
    .setColor(0xffa500)
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: interaction.user.tag, inline: true },
      { name: "Warning #", value: String(existing.length), inline: true },
      { name: "Reason", value: reason },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  try {
    await target.send(
      `⚠️ You have been warned in **${interaction.guild.name}**.\n**Reason:** ${reason}\nThis is warning #${existing.length}.`
    );
  } catch {
    // User may have DMs disabled — that's fine
  }
}
