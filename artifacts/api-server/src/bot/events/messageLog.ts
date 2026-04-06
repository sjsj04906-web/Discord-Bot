import {
  type Message,
  type PartialMessage,
  type Collection,
  type Snowflake,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { setSnipe } from "../utils/snipeStore.js";

// Fallback: find a log channel by conventional name
const NAME_PATTERNS = ["message-log", "messagelog", "msg-log", "deleted-messages"];

async function getLogChannel(
  guild: NonNullable<Message["guild"]>,
  channelId?: string
): Promise<TextChannel | null> {
  if (channelId) {
    const ch = guild.channels.cache.get(channelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }
  return (guild.channels.cache.find(
    (c) => NAME_PATTERNS.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

// ── Message Deleted ───────────────────────────────────────────────────────────
export async function handleMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;
  if (!message.content && message.attachments.size === 0) return;

  // Store for /snipe
  if (message.author && message.content) {
    const imageAttachment = message.attachments.find((a) =>
      a.contentType?.startsWith("image/") ?? false
    );
    setSnipe(message.channelId, {
      content:      message.content,
      authorTag:    message.author.tag,
      authorAvatar: message.author.displayAvatarURL(),
      channelId:    message.channelId,
      deletedAt:    new Date(),
      imageUrl:     imageAttachment?.url,
    });
  }

  const config = await getGuildConfig(message.guild.id);
  if (!config.messageLogEnabled) return;

  const logCh = await getLogChannel(message.guild, config.messageLogChannelId);
  if (!logCh) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setAuthor({ name: `🗑️  Message Deleted  ·  ${BOT_NAME}` })
    .addFields(
      {
        name:   "Author",
        value:  message.author ? `${message.author} \`${message.author.tag}\`` : "Unknown",
        inline: true,
      },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
    )
    .setThumbnail(message.author?.displayAvatarURL() ?? null)
    .setFooter({ text: `Message ID: ${message.id}  ·  User ID: ${message.author?.id ?? "?"}` })
    .setTimestamp();

  if (message.content) {
    const preview = message.content.slice(0, 1000);
    embed.setDescription(preview);
  }

  if (message.attachments.size > 0) {
    const list = message.attachments.map((a) => `[${a.name}](${a.url})`).join("\n");
    embed.addFields({ name: "Attachments", value: list.slice(0, 1024) });

    // Show first image inline
    const img = message.attachments.find((a) => a.contentType?.startsWith("image/"));
    if (img) embed.setImage(img.url);
  }

  await logCh.send({ embeds: [embed] }).catch(() => {});
}

// ── Message Edited ────────────────────────────────────────────────────────────
export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  if (!oldMessage.content) return;

  const config = await getGuildConfig(newMessage.guild.id);
  if (!config.messageLogEnabled) return;

  const logCh = await getLogChannel(newMessage.guild, config.messageLogChannelId);
  if (!logCh) return;

  const before = oldMessage.content.slice(0, 900);
  const after  = (newMessage.content ?? "").slice(0, 900);

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setAuthor({ name: `✏️  Message Edited  ·  ${BOT_NAME}` })
    .setURL(newMessage.url)
    .addFields(
      {
        name:   "Author",
        value:  newMessage.author ? `${newMessage.author} \`${newMessage.author.tag}\`` : "Unknown",
        inline: true,
      },
      { name: "Channel", value: `<#${newMessage.channelId}>  [Jump ↗](${newMessage.url})`, inline: true },
      { name: "Before",  value: before.length ? `\`\`\`\n${before}\n\`\`\`` : "*empty*", inline: false },
      { name: "After",   value: after.length  ? `\`\`\`\n${after}\n\`\`\`` : "*empty*", inline: false },
    )
    .setThumbnail(newMessage.author?.displayAvatarURL() ?? null)
    .setFooter({ text: `Message ID: ${newMessage.id}  ·  User ID: ${newMessage.author?.id ?? "?"}` })
    .setTimestamp();

  await logCh.send({ embeds: [embed] }).catch(() => {});
}

// ── Bulk Message Delete ───────────────────────────────────────────────────────
export async function handleMessageBulkDelete(
  messages: Collection<Snowflake, Message | PartialMessage>,
  channel: TextChannel,
): Promise<void> {
  const guild = channel.guild;
  const config = await getGuildConfig(guild.id);
  if (!config.messageLogEnabled) return;

  const logCh = await getLogChannel(guild, config.messageLogChannelId);
  if (!logCh) return;

  const lines: string[] = [];
  for (const msg of [...messages.values()].reverse()) {
    if (msg.author?.bot) continue;
    const who  = msg.author ? `${msg.author.tag} (${msg.author.id})` : "Unknown";
    const when = msg.createdAt ? `[${msg.createdAt.toISOString().replace("T", " ").slice(0, 19)}]` : "";
    const text = msg.content ? msg.content.replace(/\n/g, " ").slice(0, 200) : "[no content]";
    lines.push(`${when} ${who}: ${text}`);
  }

  const humanCount = messages.filter((m) => !m.author?.bot).size;
  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setAuthor({ name: `🗑️  Bulk Delete  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Channel",  value: `<#${channel.id}>`, inline: true },
      { name: "Messages", value: `${humanCount} user message(s)`, inline: true },
    )
    .setTimestamp();

  if (lines.length > 0) {
    // Discord has a 2000 char file size limit for in-embed; send as code block, chunked
    const fullLog = lines.join("\n");
    const chunks  = [];
    for (let i = 0; i < fullLog.length; i += 1800) {
      chunks.push(fullLog.slice(i, i + 1800));
    }
    // First embed carries the header
    embed.setDescription(`\`\`\`\n${chunks[0]}\n\`\`\``);
    await logCh.send({ embeds: [embed] }).catch(() => {});
    for (const chunk of chunks.slice(1)) {
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.danger)
            .setDescription(`\`\`\`\n${chunk}\n\`\`\``),
        ],
      }).catch(() => {});
    }
  } else {
    embed.setDescription("All deleted messages were from bots.");
    await logCh.send({ embeds: [embed] }).catch(() => {});
  }
}
