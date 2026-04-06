import { type Message, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig, addXp, getLevelRoles } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { levelFromXp, xpProgressInLevel, progressBar } from "../utils/xpMath.js";
import { logger } from "../../lib/logger.js";

export { levelFromXp, xpProgressInLevel } from "../utils/xpMath.js";

// ── Per-user cooldown (userId → last award timestamp) ──────────────────────
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

// Find the highest role the member qualifies for at a given level
function qualifyingRole(
  levelRoles: Awaited<ReturnType<typeof getLevelRoles>>,
  atLevel: number
) {
  return [...levelRoles].filter((lr) => lr.level <= atLevel).at(-1) ?? null;
}

export async function handleXp(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (message.content.startsWith("/")) return;

  const config = await getGuildConfig(message.guild.id).catch(() => null);
  if (!config) return;
  // Treat null/undefined as enabled — only skip if explicitly set to false
  if (config.levelingEnabled === false) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const lastAwarded = cooldowns.get(key) ?? 0;
  if (Date.now() - lastAwarded < COOLDOWN_MS) return;

  cooldowns.set(key, Date.now());

  const earned = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const { oldLevel, newLevel, newXp } = await addXp(message.guild.id, message.author.id, earned);

  logger.info({ userId: message.author.id, earned, oldLevel, newLevel, newXp }, "XP awarded");

  if (newLevel <= oldLevel) return;

  logger.info({ userId: message.author.id, oldLevel, newLevel, newXp }, "Level up");

  // ── Role swap ──────────────────────────────────────────────────────────────
  const levelRoles = await getLevelRoles(message.guild.id);
  logger.info({ count: levelRoles.length }, "Level roles loaded");

  const oldRole = qualifyingRole(levelRoles, oldLevel);
  const newRole = qualifyingRole(levelRoles, newLevel);

  logger.info({ oldRole: oldRole?.roleName, newRole: newRole?.roleName }, "Role transition");

  if (newRole && newRole.roleId !== oldRole?.roleId) {
    const member = message.guild.members.cache.get(message.author.id)
      ?? await message.guild.members.fetch(message.author.id).catch(() => null);

    if (member) {
      try {
        // Remove all stale level roles
        const staleIds = levelRoles
          .filter((lr) => lr.roleId !== newRole.roleId)
          .map((lr) => lr.roleId)
          .filter((id) => member.roles.cache.has(id)); // only remove ones they actually have

        if (staleIds.length > 0) {
          await member.roles.remove(staleIds, `Level up: replacing with ${newRole.roleName}`);
          logger.info({ removed: staleIds.length }, "Removed stale level roles");
        }

        // Fetch the new role directly (bypasses cache miss for newly created roles)
        const discordRole = message.guild.roles.cache.get(newRole.roleId)
          ?? await message.guild.roles.fetch(newRole.roleId).catch(() => null);

        if (discordRole) {
          await member.roles.add(discordRole, `Level ${newLevel} reached`);
          logger.info({ role: discordRole.name }, "Granted level role");
        } else {
          logger.warn({ roleId: newRole.roleId }, "Level role not found in Discord — was it deleted?");
        }
      } catch (err) {
        logger.error({ err }, "Failed to assign level role — check bot permissions");
      }
    } else {
      logger.warn({ userId: message.author.id }, "Could not fetch member for role assignment");
    }
  }

  // ── Level-up announcement ──────────────────────────────────────────────────
  const announceCh = (config.levelUpChannelId
    ? (message.guild.channels.cache.get(config.levelUpChannelId) as TextChannel | undefined)
    : null) ?? (message.channel as TextChannel);

  const { current, needed } = xpProgressInLevel(newXp);
  const roleChanged = newRole && newRole.roleId !== oldRole?.roleId;

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({ name: `⬆️  Level Up!  ·  ${BOT_NAME}` })
    .setThumbnail(message.author.displayAvatarURL())
    .setDescription(`${message.author} just levelled up!`)
    .addFields(
      { name: "Level",    value: `**${newLevel}**`, inline: true },
      { name: "Total XP", value: `**${newXp.toLocaleString()}**`, inline: true },
      { name: "Progress", value: `${progressBar(current, needed)} ${current}/${needed} XP to next`, inline: false },
    )
    .setFooter({
      text: roleChanged
        ? `🎖️ New role unlocked: ${newRole!.roleName}`
        : `${BOT_NAME}  ·  Keep chatting to level up`,
    })
    .setTimestamp();

  await announceCh.send({ embeds: [embed] }).catch(() => {});
}
