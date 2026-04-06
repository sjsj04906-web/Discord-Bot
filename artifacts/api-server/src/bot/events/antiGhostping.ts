import {
  type Message,
  type PartialMessage,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

const USER_MENTION  = /<@!?(\d{17,20})>/g;
const ROLE_MENTION  = /<@&(\d{17,20})>/g;
const EVERYONE_PING = /@(everyone|here)/g;

function containsPing(content: string): boolean {
  return USER_MENTION.test(content) || ROLE_MENTION.test(content) || EVERYONE_PING.test(content);
}

export async function handleAntiGhostping(
  message: Message | PartialMessage
): Promise<void> {
  if (!message.guild || message.author?.bot) return;

  const content = message.content ?? "";
  if (!containsPing(content)) return;

  const channel = message.guild.channels.cache.find(
    (c) => MOD_LOG_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  // Extract pinged user IDs
  const userMentions: string[] = [];
  const roleMentions: string[] = [];

  let m: RegExpExecArray | null;

  USER_MENTION.lastIndex = 0;
  while ((m = USER_MENTION.exec(content)) !== null) userMentions.push(m[1]!);

  ROLE_MENTION.lastIndex = 0;
  while ((m = ROLE_MENTION.exec(content)) !== null) roleMentions.push(m[1]!);

  const hasEveryone = EVERYONE_PING.test(content);

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setTitle("👻 // GHOST PING DETECTED")
    .setDescription(
      `${message.author} deleted a message that contained a mention.`
    )
    .addFields(
      { name: "CHANNEL",  value: `<#${message.channelId}>`, inline: true },
      { name: "AUTHOR",   value: `${message.author} \`${message.author?.tag}\``, inline: true },
    )
    .setFooter({ text: `${BOT_NAME} • User ID: ${message.author?.id}` })
    .setTimestamp();

  if (userMentions.length > 0) {
    embed.addFields({ name: "PINGED USERS", value: userMentions.map((id) => `<@${id}>`).join(" ") });
  }
  if (roleMentions.length > 0) {
    embed.addFields({ name: "PINGED ROLES", value: roleMentions.map((id) => `<@&${id}>`).join(" ") });
  }
  if (hasEveryone) {
    embed.addFields({ name: "MASS PING", value: "@everyone / @here" });
  }

  const msgPreview = content.slice(0, 500);
  if (msgPreview) {
    embed.addFields({ name: "MESSAGE PREVIEW", value: `\`\`\`${msgPreview}\`\`\`` });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}
