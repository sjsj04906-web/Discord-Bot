import {
  type Guild,
  EmbedBuilder,
  type TextChannel,
  type User,
} from "discord.js";
import { BOT_NAME } from "./theme.js";
import { logCase, getGuildConfig } from "./db.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

async function getModLogChannel(guild: Guild): Promise<TextChannel | null> {
  const config = await getGuildConfig(guild.id).catch(() => null);

  // 1. Dedicated mod log channel
  if (config?.modLogChannelId) {
    const ch = guild.channels.cache.get(config.modLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  // 2. Fall back to the admin log channel (so ban/kick/warn goes there if no separate mod log is set)
  if (config?.adminLogChannelId) {
    const ch = guild.channels.cache.get(config.adminLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  // 3. Auto-detect by channel name
  return (guild.channels.cache.find(
    (ch) => MOD_LOG_NAMES.includes(ch.name.toLowerCase()) && ch.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

export interface ModLogEntry {
  action: string;
  color: number;
  target: User;
  moderator: User;
  reason?: string;
  duration?: string;
  extra?: Record<string, string>;
  skipCase?: boolean;
}

export async function sendModLog(guild: Guild, entry: ModLogEntry): Promise<number | null> {
  let caseId: number | null = null;
  if (!entry.skipCase) {
    const actionType = entry.action.replace(/[^a-zA-Z\s]/g, "").trim().split(" ").slice(-1)[0] ?? entry.action;
    caseId = await logCase(
      guild.id,
      actionType,
      entry.target.id,
      entry.target.tag,
      entry.moderator.id,
      entry.moderator.tag,
      entry.reason ?? "No reason provided",
      entry.duration ?? ""
    ).catch(() => null);
  }

  const channel = await getModLogChannel(guild);
  if (!channel) return caseId;

  const embed = new EmbedBuilder()
    .setColor(entry.color)
    .setAuthor({ name: entry.action })
    .setTitle(entry.target.tag)
    .setURL(`https://discord.com/users/${entry.target.id}`)
    .setThumbnail(entry.target.displayAvatarURL())
    .addFields(
      { name: "Member",    value: `${entry.target} \`${entry.target.id}\``, inline: true },
      { name: "Moderator", value: `${entry.moderator}`, inline: true },
    )
    .setFooter({ text: `${caseId ? `Case #${caseId}  ·  ` : ""}${BOT_NAME}` })
    .setTimestamp();

  if (entry.duration) embed.addFields({ name: "Duration", value: entry.duration, inline: true });
  if (entry.reason)   embed.addFields({ name: "Reason",   value: entry.reason });

  if (entry.extra) {
    for (const [name, value] of Object.entries(entry.extra)) {
      embed.addFields({ name, value });
    }
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
  return caseId;
}
