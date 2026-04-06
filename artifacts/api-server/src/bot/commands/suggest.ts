import {
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig } from "../db.js";
import { createSuggestion } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("suggest")
  .setDescription("Submit a suggestion for the server")
  .addStringOption((o) =>
    o.setName("text").setDescription("Your suggestion").setRequired(true).setMaxLength(1000)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const text = interaction.options.getString("text", true);
  const config = await getGuildConfig(interaction.guild.id);

  if (!config.suggestionChannelId) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription("❌ The suggestion channel hasn't been configured. Ask an admin to run `/suggestions setup`."),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(config.suggestionChannelId);
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: "Suggestion channel not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const placeholder = await (channel as import("discord.js").TextChannel).send({
    content: "⏳ Posting suggestion…",
  });

  const suggId = await createSuggestion(
    interaction.guild.id,
    config.suggestionChannelId,
    placeholder.id,
    interaction.user.id,
    interaction.user.tag,
    text,
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `💡  Suggestion #${suggId}  ·  ${BOT_NAME}` })
    .setDescription(text)
    .addFields({ name: "Submitted by", value: `${interaction.user} \`${interaction.user.tag}\``, inline: true })
    .setFooter({ text: `Status: Pending  ·  ID: ${suggId}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_approve_btn_${suggId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`suggest_deny_btn_${suggId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  await placeholder.edit({ content: "", embeds: [embed], components: [row] });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.success)
        .setDescription(`✅ Your suggestion **#${suggId}** has been submitted to ${channel}!`),
    ],
  });
}
