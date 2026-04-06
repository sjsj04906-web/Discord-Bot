import { type Message, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig, addXp, getLevelRoles } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { levelFromXp, xpProgressInLevel, progressBar } from "../utils/xpMath.js";

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
  // getLevelRoles returns sorted ascending — last qualifying entry wins
  return [...levelRoles].filter((lr) => lr.level <= atLevel).at(-1) ?? null;
}

export async function handleXp(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (message.content.startsWith("/")) return;

  const config = await getGuildConfig(message.guild.id).catch(() => null);
  if (!config?.levelingEnabled) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const lastAwarded = cooldowns.get(key) ?? 0;
  if (Date.now() - lastAwarded < COOLDOWN_MS) return;

  cooldowns.set(key, Date.now());

  const earned = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const { oldLevel, newLevel, newXp } = await addXp(message.guild.id, message.author.id, earned);

  if (newLevel <= oldLevel) return;

  // ── Role swap ──────────────────────────────────────────────────────────────
  const levelRoles = await getLevelRoles(message.guild.id);
  const oldRole    = qualifyingRole(levelRoles, oldLevel);
  const newRole    = qualifyingRole(levelRoles, newLevel);

  // Only touch roles if the qualifying role actually changed
  if (newRole && newRole.roleId !== oldRole?.roleId) {
    const member = message.guild.members.cache.get(message.author.id)
      ?? await message.guild.members.fetch(message.author.id).catch(() => null);

    if (member) {
      try {
        // Remove the old qualifying role (and any stale level roles just in case)
        const staleIds = levelRoles
          .filter((lr) => lr.roleId !== newRole.roleId)
          .map((lr) => lr.roleId);
        if (staleIds.length > 0) await member.roles.remove(staleIds).catch(() => {});

        // Grant the new role
        const discordRole = message.guild.roles.cache.get(newRole.roleId);
        if (discordRole) await member.roles.add(discordRole).catch(() => {});
      } catch { /* missing perms */ }
    }
  }

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
      text: newRole && newRole.roleId !== oldRole?.roleId
        ? `🎖️ New role unlocked: ${newRole.roleName}`
        : `${BOT_NAME}  ·  Keep chatting to level up`,
    })
    .setTimestamp();

  await announceCh.send({ embeds: [embed] }).catch(() => {});
}
