import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig, getRoleBackup } from "../db.js";
import { THEME } from "../theme.js";

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

const DEHOIST_PATTERN = /^[^a-zA-Z0-9]/;
const DEHOIST_PREFIX = "zzz";

export async function handleNewAccount(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (config.newAccountDays === 0) return;

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (accountAgeDays >= config.newAccountDays) return;

  const channel = member.guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setTitle("🆕 // SUSPICIOUS NEW ACCOUNT")
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`${member} joined with a **${Math.floor(accountAgeDays * 24)} hour old** account.`)
    .addFields(
      { name: "USER",         value: `${member.user} \`${member.user.tag}\``, inline: true },
      { name: "ACCOUNT AGE",  value: `${Math.floor(accountAgeDays * 24)}h`, inline: true },
      { name: "THRESHOLD",    value: `${config.newAccountDays} days`, inline: true },
    )
    .setFooter({ text: `User ID: ${member.user.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleDehoist(member: GuildMember): Promise<void> {
  const displayName = member.nickname ?? member.user.username;
  if (!DEHOIST_PATTERN.test(displayName)) return;

  const newNick = `${DEHOIST_PREFIX} ${member.user.username}`.slice(0, 32);
  try {
    await member.setNickname(newNick, "Auto-dehoist: username started with a special character");
  } catch { /* no perms */ }
}

// ── Auto-role: assign configured roles on join ─────────────────────────────────
export async function handleAutoRole(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (!config.autoRoleIds) return;

  const roleIds = config.autoRoleIds.split(",").filter(Boolean);
  if (roleIds.length === 0) return;

  const botMember = member.guild.members.me;
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) continue;
    if (botMember && role.position >= botMember.roles.highest.position) continue;
    await member.roles.add(role, "Auto-role on join").catch(() => {});
  }
}

// ── Role restore: re-add roles from last backup if member is rejoining ─────────
export async function handleRoleRestore(member: GuildMember): Promise<void> {
  const roleIds = await getRoleBackup(member.guild.id, member.user.id);
  if (roleIds.length === 0) return;

  const botMember = member.guild.members.me;
  const restoredRoles: string[] = [];

  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) continue;
    if (botMember && role.position >= botMember.roles.highest.position) continue;
    const added = await member.roles.add(role, "Role restore on rejoin").catch(() => null);
    if (added) restoredRoles.push(role.id);
  }

  if (restoredRoles.length === 0) return;

  // Log the restore to mod-log
  const channel = member.guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setTitle("🔁 // ROLES RESTORED")
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`${member} rejoined — previous roles were restored.`)
    .addFields({
      name: `RESTORED (${restoredRoles.length})`,
      value: restoredRoles.map((id) => `<@&${id}>`).join(" "),
    })
    .setFooter({ text: `User ID: ${member.user.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
