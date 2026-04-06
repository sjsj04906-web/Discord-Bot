import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { updateGuildConfig, getGuildConfig } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("suggestions")
  .setDescription("Configure the suggestion system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s.setName("setup")
      .setDescription("Set the channel members post suggestions in (bot auto-converts them)")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Suggestion channel").setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s.setName("disable")
      .setDescription("Disable the suggestion system")
  )
  .addSubcommand((s) =>
    s.setName("status")
      .setDescription("Show current suggestion configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    await updateGuildConfig(interaction.guild.id, { suggestionChannelId: channel.id });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `✅  Suggestions Configured  ·  ${BOT_NAME}` })
          .setDescription(`Suggestions will be posted to <#${channel.id}>.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { suggestionChannelId: "" });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription("Suggestion system disabled."),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    const chId = config.suggestionChannelId;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `💡  Suggestion System  ·  ${BOT_NAME}` })
          .addFields({
            name: "Suggestion Channel",
            value: chId ? `<#${chId}>` : "Not configured",
            inline: true,
          }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
