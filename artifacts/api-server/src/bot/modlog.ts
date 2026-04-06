import {
  type Guild,
  EmbedBuilder,
  type TextChannel,
  type User,
} from "discord.js";
import { BOT_NAME } from "./theme.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

async function getModLogChannel(guild: Guild): Promise<TextChannel | null> {
  const channel = guild.channels.cache.find(
    (ch) => MOD_LOG_NAMES.includes(ch.name.toLowerCase()) && ch.isTextBased()
  ) as TextChannel | undefined;
  return channel ?? null;
}

export interface ModLogEntry {
  action: string;
  color: number;
  target: User;
  moderator: User;
  reason?: string;
  duration?: string;
  extra?: Record<string, string>;
}

export async function sendModLog(guild: Guild, entry: ModLogEntry): Promise<void> {
  const channel = await getModLogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(entry.action)
    .setColor(entry.color)
    .setThumbnail(entry.target.displayAvatarURL())
    .addFields(
      { name: "USER", value: `${entry.target} \`${entry.target.tag}\``, inline: true },
      { name: "OPERATOR", value: `${entry.moderator} \`${entry.moderator.tag}\``, inline: true },
    )
    .setFooter({ text: `${BOT_NAME} • ID: ${entry.target.id}` })
    .setTimestamp();

  if (entry.duration) {
    embed.addFields({ name: "DURATION", value: entry.duration, inline: true });
  }

  if (entry.reason) {
    embed.addFields({ name: "REASON", value: entry.reason });
  }

  if (entry.extra) {
    for (const [name, value] of Object.entries(entry.extra)) {
      embed.addFields({ name, value });
    }
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}
