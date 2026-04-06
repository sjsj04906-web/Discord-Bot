import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { log } from "../display.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Set slowmode for the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption((o) =>
    o.setName("seconds")
      .setDescription("Delay in seconds (0 to disable, max 21600)")
      .setMinValue(0).setMaxValue(21600).setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const seconds = interaction.options.getInteger("seconds", true);
  const channel = interaction.channel as TextChannel;

  if (!channel?.setRateLimitPerUser) {
    await interaction.reply({ content: "Text channels only.", ephemeral: true });
    return;
  }

  try {
    await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
    const label = seconds === 0 ? "DISABLED" : `${seconds}s`;

    const embed = new EmbedBuilder()
      .setColor(THEME.slowmode)
      .setTitle(seconds === 0 ? "🔊 // THROTTLE REMOVED" : "🐢 // CHANNEL THROTTLED")
      .setDescription(seconds === 0
        ? `Slowmode has been lifted from ${channel}.`
        : `Transmission rate limited to **1 message every ${label}** in ${channel}.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.slowmode(channel.name, interaction.guild?.name ?? "Unknown", seconds);
  } catch (err) {
    await interaction.reply({ content: `Failed: ${String(err)}`, ephemeral: true });
  }
}
