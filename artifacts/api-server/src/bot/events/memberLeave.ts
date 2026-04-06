import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { THEME } from "../theme.js";
import { saveRoleBackup } from "../db.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

const IGNORED_ROLE_NAMES = ["@everyone"];

export async function handleMemberLeave(member: GuildMember): Promise<void> {
  const guild = member.guild;

  // ── Save role backup so we can restore on rejoin ───────────────────────────
  const roleIds = member.roles.cache
    .filter((r) => !IGNORED_ROLE_NAMES.includes(r.name) && r.id !== guild.id)
    .map((r) => r.id);

  if (roleIds.length > 0) {
    await saveRoleBackup(guild.id, member.user.id, roleIds).catch(() => {});
  }

  // ── Log to mod channel ──────────────────────────────────────────────────────
  const channel = guild.channels.cache.find(
    (c) => MOD_LOG_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const joinedAt = member.joinedAt;
  const timeInServer = joinedAt
    ? Math.floor((Date.now() - joinedAt.getTime()) / 1000)
    : null;

  const rolesDisplay = roleIds.length > 0
    ? roleIds.slice(0, 10).map((id) => `<@&${id}>`).join(" ")
    : "None";

  const embed = new EmbedBuilder()
    .setColor(THEME.muted)
    .setTitle("🚪 // ENTITY DISCONNECTED")
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "USER",      value: `${member.user} \`${member.user.tag}\``, inline: true },
      { name: "ID",        value: `\`${member.user.id}\``, inline: true },
      { name: "ROLES",     value: rolesDisplay },
    )
    .setFooter({ text: `Member count: ${guild.memberCount}` })
    .setTimestamp();

  if (timeInServer !== null) {
    embed.addFields({
      name: "TIME IN SERVER",
      value: `<t:${Math.floor(joinedAt!.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}
