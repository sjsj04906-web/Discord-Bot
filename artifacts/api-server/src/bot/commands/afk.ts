import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { setAfk, isAfk } from "../utils/afkStore.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("afk")
  .setDescription("Set yourself as AFK — clears automatically when you send a message")
  .addStringOption((o) =>
    o.setName("reason")
      .setDescription("Why you're AFK (shown when someone pings you)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const reason = interaction.options.getString("reason") ?? "AFK";

  if (isAfk(interaction.guild.id, interaction.user.id)) {
    // Update reason if already AFK
    setAfk(interaction.guild.id, interaction.user.id, reason);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.muted)
          .setDescription(`💤 AFK reason updated to: **${reason}**`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  setAfk(interaction.guild.id, interaction.user.id, reason);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.muted)
        .setAuthor({ name: `💤  AFK Set  ·  ${BOT_NAME}` })
        .setDescription(`You are now AFK: **${reason}**\n\nAnyone who pings you will be notified. Send a message to clear your AFK status.`),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
