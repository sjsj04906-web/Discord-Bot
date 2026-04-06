import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { log } from "../display.js";

export const data = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Set slowmode for the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption((o) =>
    o.setName("seconds")
      .setDescription("Delay in seconds between messages (0 to disable, max 21600)")
      .setMinValue(0)
      .setMaxValue(21600)
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const seconds = interaction.options.getInteger("seconds", true);
  const channel = interaction.channel as TextChannel;

  if (!channel?.setRateLimitPerUser) {
    await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
    return;
  }

  try {
    await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
    const label = seconds === 0 ? "disabled" : `${seconds}s`;

    const embed = new EmbedBuilder()
      .setColor(seconds === 0 ? Colors.Green : Colors.Blue)
      .setTitle(seconds === 0 ? "🔊 Slowmode Disabled" : "🐢 Slowmode Enabled")
      .setDescription(seconds === 0
        ? `Slowmode has been removed from ${channel}.`
        : `Users must wait **${label}** between messages in ${channel}.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.slowmode(channel.name, interaction.guild?.name ?? "Unknown", seconds);
  } catch (err) {
    await interaction.reply({ content: `Failed to set slowmode: ${String(err)}`, ephemeral: true });
  }
}
