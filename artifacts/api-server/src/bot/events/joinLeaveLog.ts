import { type GuildMember, type PartialGuildMember, EmbedBuilder, type TextChannel, time, TimestampStyles } from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const FALLBACK_NAMES = ["join-log", "joinlog", "member-log", "member-activity", "admin-log", "adminlog"];

async function getJoinLogChannel(guild: GuildMember["guild"]): Promise<TextChannel | null> {
  const config = await getGuildConfig(guild.id).catch(() => null);

  if (config?.joinLogChannelId) {
    const ch = guild.channels.cache.get(config.joinLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }
  if (config?.adminLogChannelId) {
    const ch = guild.channels.cache.get(config.adminLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  return (guild.channels.cache.find(
    (c) => FALLBACK_NAMES.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

function accountAgeLine(createdAt: Date): string {
  const ageMs   = Date.now() - createdAt.getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  if (ageDays < 7) return `⚠️ **New account** — created ${ageDays}d ago`;
  if (ageDays < 30) return `${ageDays} days old`;
  const ageMonths = Math.floor(ageDays / 30);
  if (ageMonths < 12) return `${ageMonths} month${ageMonths !== 1 ? "s" : ""} old`;
  const ageYears = Math.floor(ageMonths / 12);
  return `${ageYears} year${ageYears !== 1 ? "s" : ""} old`;
}

export async function handleMemberJoinLog(member: GuildMember): Promise<void> {
  const logCh = await getJoinLogChannel(member.guild);
  if (!logCh) return;

  const created = member.user.createdAt;
  const ageLine = accountAgeLine(created);
  const memberCount = member.guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({ name: `📥  Member Joined  ·  ${BOT_NAME}` })
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`${member} **${member.user.tag}**`)
    .addFields(
      { name: "Account Created", value: `${time(created, TimestampStyles.RelativeTime)} — ${ageLine}`, inline: false },
      { name: "Member #",        value: `${memberCount}`, inline: true },
      { name: "User ID",         value: `\`${member.user.id}\``, inline: true },
    )
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp();

  await logCh.send({ embeds: [embed] }).catch(() => {});
}

export async function handleMemberLeaveLog(member: GuildMember | PartialGuildMember): Promise<void> {
  const logCh = await getJoinLogChannel(member.guild);
  if (!logCh) return;

  const roles = member.roles?.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => `<@&${r.id}>`)
    .join(" ") || "None";

  const joinedAt = member.joinedAt;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setAuthor({ name: `📤  Member Left  ·  ${BOT_NAME}` })
    .setThumbnail(member.user?.displayAvatarURL() ?? null)
    .setDescription(`**${member.user?.tag ?? "Unknown#0000"}** \`${member.user?.id}\``)
    .addFields(
      { name: "Joined",  value: joinedAt ? time(joinedAt, TimestampStyles.RelativeTime) : "Unknown", inline: true },
      { name: "Roles",   value: roles.slice(0, 1024), inline: false },
    )
    .setFooter({ text: `ID: ${member.user?.id ?? "?"}` })
    .setTimestamp();

  await logCh.send({ embeds: [embed] }).catch(() => {});
}
