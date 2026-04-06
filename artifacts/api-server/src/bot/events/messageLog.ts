import {
  type Message,
  type PartialMessage,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME } from "../theme.js";

const LOG_CHANNEL_NAMES = ["message-log", "messagelog", "msg-log", "deleted-messages"];

async function getLogChannel(guild: NonNullable<Message["guild"]>): Promise<TextChannel | null> {
  const ch = guild.channels.cache.find(
    (c) => LOG_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;
  return ch ?? null;
}

export async function handleMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;
  if (!message.content && message.attachments.size === 0) return;

  const config = await getGuildConfig(message.guild.id);
  if (!config.messageLogEnabled) return;

  const channel = await getLogChannel(message.guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setTitle("🗑️ // MESSAGE DELETED")
    .addFields(
      { name: "AUTHOR", value: message.author ? `${message.author} \`${message.author.tag}\`` : "Unknown", inline: true },
      { name: "CHANNEL", value: `<#${message.channelId}>`, inline: true },
    )
    .setTimestamp();

  if (message.content) {
    const preview = message.content.slice(0, 1000);
    embed.addFields({ name: "CONTENT", value: `\`\`\`${preview}\`\`\`` });
  }

  if (message.attachments.size > 0) {
    embed.addFields({ name: "ATTACHMENTS", value: message.attachments.map((a) => a.url).join("\n") });
  }

  embed.setFooter({ text: `Message ID: ${message.id}` });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  if (!oldMessage.content) return;

  const config = await getGuildConfig(newMessage.guild.id);
  if (!config.messageLogEnabled) return;

  const channel = await getLogChannel(newMessage.guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setTitle("✏️ // MESSAGE EDITED")
    .setURL(newMessage.url)
    .addFields(
      { name: "AUTHOR", value: newMessage.author ? `${newMessage.author} \`${newMessage.author.tag}\`` : "Unknown", inline: true },
      { name: "CHANNEL", value: `<#${newMessage.channelId}>`, inline: true },
      { name: "BEFORE", value: `\`\`\`${oldMessage.content.slice(0, 500)}\`\`\`` },
      { name: "AFTER",  value: `\`\`\`${(newMessage.content ?? "").slice(0, 500)}\`\`\`` },
    )
    .setFooter({ text: `Message ID: ${newMessage.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
