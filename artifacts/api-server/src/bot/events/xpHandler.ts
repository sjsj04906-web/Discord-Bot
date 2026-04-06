import { type Message, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig, getOrCreateXp, addXp, getLevelRoles } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { levelFromXp, xpProgressInLevel, progressBar } from "../utils/xpMath.js";

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
  if (!config?.levelingEnabled) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const lastAwarded = cooldowns.get(key) ?? 0;
  if (Date.now() - lastAwarded < COOLDOWN_MS) return;

  cooldowns.set(key, Date.now());

  const earned = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const { oldLevel, newLevel, newXp } = await addXp(message.guild.id, message.author.id, earned);

  if (newLevel <= oldLevel) return;

  // Assign / swap level roles
  const levelRoles = await getLevelRoles(message.guild.id);
  const member = message.guild.members.cache.get(message.author.id)
    ?? await message.guild.members.fetch(message.author.id).catch(() => null);

  if (member) {
    const rolesToRemove = levelRoles
      .filter((lr) => lr.level !== newLevel)
      .map((lr) => lr.roleId);

    const newRoleEntry = levelRoles.find((lr) => lr.level === newLevel);

    try {
      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove as string[]).catch(() => {});
      }
      if (newRoleEntry) {
        const role = message.guild.roles.cache.get(newRoleEntry.roleId);
        if (role) await member.roles.add(role).catch(() => {});
      }
    } catch { /* missing perms */ }
  }

  // Determine which channel to post in
  const announceCh = (config.levelUpChannelId
    ? (message.guild.channels.cache.get(config.levelUpChannelId) as TextChannel | undefined)
    : null) ?? (message.channel as TextChannel);

  const newRoleEntry = levelRoles.find((lr) => lr.level === newLevel);
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
      text: newRoleEntry
        ? `New role unlocked: ${newRoleEntry.roleName}`
        : `${BOT_NAME}  ·  Keep chatting to level up`,
    })
    .setTimestamp();

  await announceCh.send({ embeds: [embed] }).catch(() => {});
}
