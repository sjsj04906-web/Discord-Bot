import {
  EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, type Message, ChannelType,
} from "discord.js";
import { BOT_NAME } from "../theme.js";
import { getGuildConfig, createSuggestion } from "../db.js";

export async function handleSuggestionMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (!message.content.trim()) return;

  const content = message.content.trim();

  if (content.length < 10) {
    const warn = await message.reply({
      content: "❌ Your suggestion is too short — please write at least 10 characters.",
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 6_000);
    await message.delete().catch(() => {});
    return;
  }

  await message.delete().catch(() => {});

  const suggId = await createSuggestion(
    message.guild.id,
    message.channelId,
    "pending",
    message.author.id,
    message.author.tag,
    content,
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: `💡  Suggestion #${suggId}  ·  ${BOT_NAME}`,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(content)
    .addFields(
      { name: "Submitted by", value: `${message.author} \`${message.author.tag}\``, inline: true },
      { name: "Status",       value: "⏳ Pending",                                   inline: true },
    )
    .setFooter({ text: `ID: ${suggId}  ·  React below to discuss` })
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

  const posted = await (message.channel as import("discord.js").TextChannel)
    .send({ embeds: [embed], components: [row] })
    .catch(() => null);

  if (!posted) return;

  await import("../db.js").then((m) =>
    m.updateSuggestionMessageId(suggId, posted.id)
  );

  if (
    message.channel.type === ChannelType.GuildText &&
    message.channel.permissionsFor(message.guild.members.me!)?.has("CreatePublicThreads")
  ) {
    await posted.startThread({
      name: `Discussion: Suggestion #${suggId}`,
      autoArchiveDuration: 1440,
      reason: `Suggestion #${suggId} by ${message.author.tag}`,
    }).catch(() => {});
  }
}
