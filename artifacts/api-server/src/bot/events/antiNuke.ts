import {
  AuditLogEvent,
  EmbedBuilder,
  type Role,
  type GuildChannel,
  type Guild,
  type User,
  type TextChannel,
} from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { logger } from "../../lib/logger.js";

// ── In-memory action tracker ───────────────────────────────────────────────
// key: `${guildId}:${userId}`  value: array of timestamps
const actionLog = new Map<string, number[]>();
// prevent double-triggering on the same user within 30s
const activeLockouts = new Set<string>();

function recordAction(guildId: string, userId: string, windowMs: number): number {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const recent = (actionLog.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  actionLog.set(key, recent);
  return recent.length;
}

async function getAuditExecutor(guild: Guild, type: AuditLogEvent): Promise<User | null> {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    const entry = logs.entries.first();
    if (!entry) return null;
    if (Date.now() - entry.createdTimestamp > 5000) return null; // stale
    return entry.executor ?? null;
  } catch {
    return null;
  }
}

async function triggerNukeResponse(guild: Guild, executor: User): Promise<void> {
  const key = `${guild.id}:${executor.id}`;
  if (activeLockouts.has(key)) return;
  activeLockouts.add(key);
  setTimeout(() => activeLockouts.delete(key), 30_000);

  logger.warn({ guild: guild.id, executor: executor.tag }, "Anti-nuke triggered");

  const config = await getGuildConfig(guild.id);
  const member  = await guild.members.fetch(executor.id).catch(() => null);

  let stripped = 0;
  let timedOut = false;

  if (member) {
    const botMember = guild.members.me!;
    const removable = member.roles.cache.filter(
      (r) =>
        r.id !== guild.id &&
        !r.managed &&
        r.position < botMember.roles.highest.position,
    );
    if (removable.size > 0) {
      await member.roles.remove([...removable.keys()], "Anti-nuke: emergency role strip").catch(() => {});
      stripped = removable.size;
    }
    // Timeout for 28 days (max Discord allows)
    const timedOutResult = await member
      .timeout(28 * 24 * 60 * 60 * 1000, "Anti-nuke: emergency timeout")
      .catch(() => null);
    timedOut = !!timedOutResult;
  }

  // DM the offender
  await executor
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setAuthor({ name: `🚨  Anti-Nuke Triggered  ·  ${BOT_NAME}` })
          .setDescription(
            `Your account triggered the anti-nuke system in **${guild.name}** by performing too many destructive actions in a short window.\n\nYour roles have been removed and you have been timed out pending staff review.`,
          )
          .setTimestamp(),
      ],
    })
    .catch(() => {});

  // Alert admins
  const alertChannelId = config.adminLogChannelId;
  const alertChannel = alertChannelId
    ? (guild.channels.cache.get(alertChannelId) as TextChannel | undefined)
    : null;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setAuthor({ name: `🚨  ANTI-NUKE TRIGGERED  ·  ${BOT_NAME}` })
    .setThumbnail(executor.displayAvatarURL())
    .setDescription(`**${executor.tag}** (${executor}) triggered the anti-nuke threshold.`)
    .addFields(
      { name: "USER",        value: `${executor} \`${executor.tag}\``, inline: true },
      { name: "USER ID",     value: executor.id,                        inline: true },
      { name: "ACTION",      value: stripped > 0 ? `${stripped} roles stripped` : "No roles to strip", inline: true },
      { name: "TIMEOUT",     value: timedOut ? "28 days applied" : "Could not timeout (insufficient perms)", inline: true },
    )
    .setFooter({ text: `${BOT_NAME}  ·  Review and take further action if necessary` })
    .setTimestamp();

  if (alertChannel) {
    await alertChannel.send({ embeds: [embed] }).catch(() => {});
  } else {
    // Fallback: try any channel named admin-log or mod-log
    const fallback = guild.channels.cache.find(
      (c) =>
        ["admin-log", "admin-logs", "mod-log", "mod-logs"].includes(c.name.toLowerCase()) &&
        c.isTextBased(),
    ) as TextChannel | undefined;
    await fallback?.send({ embeds: [embed] }).catch(() => {});
  }
}

// ── Public handlers (called from index.ts event hooks) ─────────────────────

export async function handleAntiNukeRoleDelete(role: Role): Promise<void> {
  const guild = role.guild;
  const config = await getGuildConfig(guild.id).catch(() => null);
  if (!config?.antiNukeEnabled) return;

  const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete);
  if (!executor || executor.id === guild.client.user?.id) return;

  const windowMs   = (config.antiNukeWindowSecs ?? 10) * 1000;
  const threshold  = config.antiNukeThreshold ?? 3;
  const count      = recordAction(guild.id, executor.id, windowMs);

  if (count >= threshold) await triggerNukeResponse(guild, executor);
}

export async function handleAntiNukeChannelDelete(channel: GuildChannel): Promise<void> {
  const guild = channel.guild;
  const config = await getGuildConfig(guild.id).catch(() => null);
  if (!config?.antiNukeEnabled) return;

  const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete);
  if (!executor || executor.id === guild.client.user?.id) return;

  const windowMs  = (config.antiNukeWindowSecs ?? 10) * 1000;
  const threshold = config.antiNukeThreshold ?? 3;
  const count     = recordAction(guild.id, executor.id, windowMs);

  if (count >= threshold) await triggerNukeResponse(guild, executor);
}

export async function handleAntiNukeBanAdd(guild: Guild): Promise<void> {
  const config = await getGuildConfig(guild.id).catch(() => null);
  if (!config?.antiNukeEnabled) return;

  const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd);
  if (!executor || executor.id === guild.client.user?.id) return;

  const windowMs  = (config.antiNukeWindowSecs ?? 10) * 1000;
  const threshold = config.antiNukeThreshold ?? 3;
  const count     = recordAction(guild.id, executor.id, windowMs);

  if (count >= threshold) await triggerNukeResponse(guild, executor);
}
