import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { setupCounting, resetCounting, disableCounting, getCountingState } from "../events/counting.js";

export const data = new SlashCommandBuilder()
  .setName("counting")
  .setDescription("Configure or manage the counting channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Set the counting channel")
      .addChannelOption((o) => o.setName("channel").setDescription("The channel to use for counting").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("reset").setDescription("Reset the count back to zero"))
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable the counting channel"))
  .addSubcommand((sub) => sub.setName("status").setDescription("Show current counting stats"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    await setupCounting(interaction.guild.id, channel.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🔢  Counting Setup  ·  ${BOT_NAME}` })
          .setDescription(`Counting channel set to ${channel}.\n\nMembers must count sequentially starting from **1**. Wrong numbers or counting twice in a row will reset the count to zero.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "reset") {
    const state = await getCountingState(interaction.guild.id);
    if (!state?.channelId) {
      await interaction.reply({ content: "No counting channel is configured.", ephemeral: true });
      return;
    }
    const old = await resetCounting(interaction.guild.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`✅ Count reset from **${old}** back to **0**. Someone ruined it — start from 1!`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "disable") {
    await disableCounting(interaction.guild.id);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription("✅ Counting channel disabled.")],
      ephemeral: true,
    });
    return;
  }

  if (sub === "status") {
    const state = await getCountingState(interaction.guild.id);
    if (!state?.channelId) {
      await interaction.reply({ content: "No counting channel is configured. Use `/counting setup` to set one.", ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `🔢  Counting Status  ·  ${BOT_NAME}` })
          .addFields(
            { name: "Channel",       value: `<#${state.channelId}>`,             inline: true },
            { name: "Current Count", value: `**${state.currentCount}**`,          inline: true },
            { name: "High Score",    value: `**${state.highScore}**`,             inline: true },
            { name: "Last Counter",  value: state.lastUserId ? `<@${state.lastUserId}>` : "Nobody yet", inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }
}
