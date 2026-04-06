import {
  type Guild,
  type GuildChannel,
  type Role,
  type GuildMember,
  type PartialGuildMember,
  type TextChannel,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
const FALLBACK_NAMES = ["admin-log", "adminlog", "server-log", "serverlog", "audit-log", "auditlog"];

async function getAdminLogChannel(guild: Guild): Promise<TextChannel | null> {
  const config = await getGuildConfig(guild.id).catch(() => null);
  if (!config?.adminLogEnabled) return null;

  if (config.adminLogChannelId) {
    const ch = guild.channels.cache.get(config.adminLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  return (guild.channels.cache.find(
    (c) => FALLBACK_NAMES.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

function channelTypeName(type: ChannelType): string {
  const map: Partial<Record<ChannelType, string>> = {
    [ChannelType.GuildText]:        "Text",
    [ChannelType.GuildVoice]:       "Voice",
    [ChannelType.GuildCategory]:    "Category",
    [ChannelType.GuildAnnouncement]:"Announcement",
    [ChannelType.GuildStageVoice]:  "Stage",
    [ChannelType.GuildForum]:       "Forum",
  };
  return map[type] ?? "Channel";
}

// ── Channel Created ───────────────────────────────────────────────────────────
export async function handleChannelCreate(channel: GuildChannel): Promise<void> {
  const logCh = await getAdminLogChannel(channel.guild);
  if (!logCh) return;

  // Fetch who created it from audit log
  let executor = "Unknown";
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry && entry.targetId === channel.id) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.success)
        .setAuthor({ name: `📁  Channel Created  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Channel",  value: `${channel} \`${channel.name}\``,            inline: true },
          { name: "Type",     value: channelTypeName(channel.type),                inline: true },
          { name: "Category", value: channel.parent?.name ?? "None",              inline: true },
          { name: "By",       value: executor,                                     inline: true },
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Channel Deleted ───────────────────────────────────────────────────────────
export async function handleChannelDelete(channel: GuildChannel): Promise<void> {
  const logCh = await getAdminLogChannel(channel.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.danger)
        .setAuthor({ name: `🗑️  Channel Deleted  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Channel",  value: `\`#${channel.name}\``,                      inline: true },
          { name: "Type",     value: channelTypeName(channel.type),                inline: true },
          { name: "Category", value: channel.parent?.name ?? "None",              inline: true },
          { name: "By",       value: executor,                                     inline: true },
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Channel Updated ───────────────────────────────────────────────────────────
export async function handleChannelUpdate(
  oldChannel: GuildChannel,
  newChannel: GuildChannel,
): Promise<void> {
  const changes: string[] = [];

  if (oldChannel.name !== newChannel.name)
    changes.push(`**Name:** \`${oldChannel.name}\` → \`${newChannel.name}\``);

  if ("topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic)
    changes.push(`**Topic:** ${oldChannel.topic || "_none_"} → ${newChannel.topic || "_none_"}`);

  if ("nsfw" in oldChannel && "nsfw" in newChannel && oldChannel.nsfw !== newChannel.nsfw)
    changes.push(`**NSFW:** ${oldChannel.nsfw} → ${newChannel.nsfw}`);

  if ("rateLimitPerUser" in oldChannel && "rateLimitPerUser" in newChannel &&
      oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser)
    changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);

  if (changes.length === 0) return;

  const logCh = await getAdminLogChannel(newChannel.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry && entry.targetId === newChannel.id) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.info)
        .setAuthor({ name: `✏️  Channel Updated  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Channel", value: `${newChannel}`, inline: true },
          { name: "By",      value: executor,         inline: true },
        )
        .setDescription(changes.join("\n"))
        .setFooter({ text: `ID: ${newChannel.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Role Created ──────────────────────────────────────────────────────────────
export async function handleRoleCreate(role: Role): Promise<void> {
  const logCh = await getAdminLogChannel(role.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry && entry.targetId === role.id) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(role.color || THEME.success)
        .setAuthor({ name: `🏷️  Role Created  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Role",  value: `${role} \`${role.name}\``, inline: true },
          { name: "Color", value: role.hexColor,              inline: true },
          { name: "By",    value: executor,                   inline: true },
        )
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Role Deleted ──────────────────────────────────────────────────────────────
export async function handleRoleDelete(role: Role): Promise<void> {
  const logCh = await getAdminLogChannel(role.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.danger)
        .setAuthor({ name: `🗑️  Role Deleted  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Role",  value: `\`@${role.name}\``, inline: true },
          { name: "Color", value: role.hexColor,        inline: true },
          { name: "By",    value: executor,              inline: true },
        )
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Role Updated ──────────────────────────────────────────────────────────────
export async function handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const changes: string[] = [];

  if (oldRole.name !== newRole.name)
    changes.push(`**Name:** \`${oldRole.name}\` → \`${newRole.name}\``);
  if (oldRole.color !== newRole.color)
    changes.push(`**Color:** \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
  if (oldRole.hoist !== newRole.hoist)
    changes.push(`**Hoisted:** ${oldRole.hoist} → ${newRole.hoist}`);
  if (oldRole.mentionable !== newRole.mentionable)
    changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);

  if (changes.length === 0) return;

  const logCh = await getAdminLogChannel(newRole.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry && entry.targetId === newRole.id) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(newRole.color || THEME.info)
        .setAuthor({ name: `✏️  Role Updated  ·  ${BOT_NAME}` })
        .addFields(
          { name: "Role", value: `${newRole}`, inline: true },
          { name: "By",   value: executor,      inline: true },
        )
        .setDescription(changes.join("\n"))
        .setFooter({ text: `ID: ${newRole.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Member Updated (role / nickname changes) ──────────────────────────────────
export async function handleAdminMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  const changes: string[] = [];

  // Nickname change
  if (!oldMember.partial && oldMember.nickname !== newMember.nickname) {
    const before = oldMember.nickname ? `\`${oldMember.nickname}\`` : "_none_";
    const after  = newMember.nickname ? `\`${newMember.nickname}\`` : "_none_";
    changes.push(`**Nickname:** ${before} → ${after}`);
  }

  // Role additions / removals
  if (!oldMember.partial) {
    const added   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
    const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

    if (added.size > 0)
      changes.push(`**Roles Added:** ${added.map((r) => `${r}`).join(", ")}`);
    if (removed.size > 0)
      changes.push(`**Roles Removed:** ${removed.map((r) => `${r}`).join(", ")}`);
  }

  if (changes.length === 0) return;

  const logCh = await getAdminLogChannel(newMember.guild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry && entry.targetId === newMember.id) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.warning)
        .setAuthor({ name: `👤  Member Updated  ·  ${BOT_NAME}` })
        .setTitle(newMember.user.tag)
        .setURL(`https://discord.com/users/${newMember.id}`)
        .setThumbnail(newMember.user.displayAvatarURL())
        .addFields(
          { name: "Member", value: `${newMember}`, inline: true },
          { name: "By",     value: executor,         inline: true },
        )
        .setDescription(changes.join("\n"))
        .setFooter({ text: `ID: ${newMember.id}` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Server Updated ────────────────────────────────────────────────────────────
export async function handleGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
  const changes: string[] = [];

  if (oldGuild.name !== newGuild.name)
    changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.verificationLevel !== newGuild.verificationLevel)
    changes.push(`**Verification:** \`${oldGuild.verificationLevel}\` → \`${newGuild.verificationLevel}\``);
  if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter)
    changes.push(`**Content Filter:** \`${oldGuild.explicitContentFilter}\` → \`${newGuild.explicitContentFilter}\``);
  if (oldGuild.afkChannelId !== newGuild.afkChannelId)
    changes.push(`**AFK Channel:** changed`);
  if (oldGuild.systemChannelId !== newGuild.systemChannelId)
    changes.push(`**System Channel:** changed`);

  if (changes.length === 0) return;

  const logCh = await getAdminLogChannel(newGuild);
  if (!logCh) return;

  let executor = "Unknown";
  const audit = await newGuild.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (entry) executor = `${entry.executor} \`${entry.executor?.tag}\``;

  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.info)
        .setAuthor({ name: `🏠  Server Updated  ·  ${BOT_NAME}` })
        .setTitle(newGuild.name)
        .setThumbnail(newGuild.iconURL())
        .addFields({ name: "By", value: executor, inline: true })
        .setDescription(changes.join("\n"))
        .setTimestamp(),
    ],
  }).catch(() => {});
}
