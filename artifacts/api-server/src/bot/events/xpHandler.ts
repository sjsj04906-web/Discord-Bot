import { type Message, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig, addXp, getLevelRoles } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { levelFromXp, xpProgressInLevel, progressBar } from "../utils/xpMath.js";
import { syncMemberLevelRole } from "../utils/roleSync.js";
import { logger } from "../../lib/logger.js";

export { levelFromXp, xpProgressInLevel } from "../utils/xpMath.js";

// ── Per-user cooldown (userId → last award timestamp) ──────────────────────
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

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

  let earned = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  // XP Surge market item — doubles per-message XP for 1 hour
  try {
    const { hasActiveItem } = await import("../commands/market.js");
    if (await hasActiveItem(message.guild.id, message.author.id, "xp_surge")) {
      earned *= 2;
    }
  } catch { /* market module unavailable — skip buff */ }

  const { oldLevel, newLevel, newXp } = await addXp(message.guild.id, message.author.id, earned);

  logger.info({ userId: message.author.id, earned, oldLevel, newLevel, newXp }, "XP awarded");

  if (newLevel <= oldLevel) return;

  logger.info({ userId: message.author.id, oldLevel, newLevel, newXp }, "Level up");

  // ── Role sync ──────────────────────────────────────────────────────────────
  const grantedRole = await syncMemberLevelRole(message.guild, message.author.id, newXp)
    .catch((err) => { logger.error({ err }, "Role sync failed"); return null; });

  if (grantedRole) logger.info({ role: grantedRole }, "Level role granted");

  // ── Level-up announcement ──────────────────────────────────────────────────
  const announceCh = (config.levelUpChannelId
    ? (message.guild.channels.cache.get(config.levelUpChannelId) as TextChannel | undefined)
    : null) ?? (message.channel as TextChannel);

  const { current, needed } = xpProgressInLevel(newXp);

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
      text: grantedRole
        ? `🎖️ New role unlocked: ${grantedRole}`
        : `${BOT_NAME}  ·  Keep chatting to level up`,
    })
    .setTimestamp();

  await announceCh.send({ embeds: [embed] }).catch(() => {});
}
