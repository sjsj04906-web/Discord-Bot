import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { THEME } from "../theme.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

function getModLog(member: GuildMember): TextChannel | undefined {
  return member.guild.channels.cache.find(
    (c) => MOD_LOG_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;
}

export async function handleMemberUpdate(
  oldMember: GuildMember,
  newMember: GuildMember
): Promise<void> {
  const channel = getModLog(newMember);
  if (!channel) return;

  // ── Nickname change ─────────────────────────────────────────────────────────
  const oldNick = oldMember.nickname ?? oldMember.user.username;
  const newNick = newMember.nickname ?? newMember.user.username;

  if (oldNick !== newNick && !newNick.startsWith("zzz ")) {
    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("✏️ // NICKNAME CHANGED")
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: "USER",    value: `${newMember} \`${newMember.user.tag}\``, inline: true },
        { name: "BEFORE",  value: `\`${oldNick}\``, inline: true },
        { name: "AFTER",   value: `\`${newNick}\``, inline: true },
      )
      .setFooter({ text: `User ID: ${newMember.user.id}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  // ── Role changes ────────────────────────────────────────────────────────────
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const added   = newRoles.filter((r) => !oldRoles.has(r.id) && r.name !== "@everyone");
  const removed = oldRoles.filter((r) => !newRoles.has(r.id) && r.name !== "@everyone");

  if (added.size === 0 && removed.size === 0) return;

  const embed = new EmbedBuilder()
    .setColor(added.size > 0 ? THEME.success : THEME.warn)
    .setTitle(added.size > 0 && removed.size > 0
      ? "🎭 // ROLES UPDATED"
      : added.size > 0
      ? "🎭 // ROLE ADDED"
      : "🎭 // ROLE REMOVED"
    )
    .setThumbnail(newMember.user.displayAvatarURL())
    .addFields(
      { name: "USER", value: `${newMember} \`${newMember.user.tag}\``, inline: true },
    )
    .setFooter({ text: `User ID: ${newMember.user.id}` })
    .setTimestamp();

  if (added.size > 0) {
    embed.addFields({ name: "➕ ADDED", value: added.map((r) => `${r}`).join(", "), inline: true });
  }
  if (removed.size > 0) {
    embed.addFields({ name: "➖ REMOVED", value: removed.map((r) => `${r}`).join(", "), inline: true });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}
