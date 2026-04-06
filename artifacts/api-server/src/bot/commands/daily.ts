import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastDaily } from "../db.js";
import { checkAndAward } from "../lib/achievements.js";
import { PRESTIGE_BONUS, getPrestigeInfo } from "./prestige.js";

const DAILY_MS = 20 * 60 * 60 * 1000;
const STREAK_RESET_MS = 48 * 60 * 60 * 1000;

const STREAK_LINES: [number, string][] = [
  [100, "🌌 **Mythic.** The network bows to your consistency."],
  [60,  "⚜️ **Legendary streak.** You are embedded in this system."],
  [30,  "💠 **Transcendent.** The protocol recognises you."],
  [14,  "🔥 **Two weeks.** Your signal refuses to die."],
  [7,   "⚡ **One week.** The grid knows your rhythm."],
  [3,   "✦ You're building something here. Keep going."],
  [1,   ""],
];

function streakLine(streak: number): string {
  for (const [min, line] of STREAK_LINES) {
    if (streak >= min) return line;
  }
  return "";
}

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily coin reward");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config   = await getGuildConfig(interaction.guild.id);
  const eco      = await getBalance(interaction.guild.id, interaction.user.id);
  const em       = config.currencyEmoji;
  const baseName = config.currencyName;
  const base     = config.dailyAmount;

  const now = Date.now();
  if (eco.lastDaily && now - eco.lastDaily.getTime() < DAILY_MS) {
    const next = eco.lastDaily.getTime() + DAILY_MS;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setAuthor({ name: `${em}  Daily Reward  ·  ${BOT_NAME}` })
          .setDescription(`> Signal already collected. Return <t:${Math.floor(next / 1000)}:R>.`)
          .setFooter({ text: `${BOT_NAME}  ◆  Economy` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let streak = eco.dailyStreak;
  if (eco.lastDaily && now - eco.lastDaily.getTime() < STREAK_RESET_MS) {
    streak += 1;
  } else {
    streak = 1;
  }

  const bonus        = Math.floor(base * 0.1 * Math.min(streak - 1, 10));
  const prestigeMult = 1 + eco.prestige * PRESTIGE_BONUS;
  const total        = Math.floor((base + bonus) * prestigeMult);

  await updateLastDaily(interaction.guild.id, interaction.user.id, streak);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, total);
  checkAndAward(interaction.guild.id, interaction.user.id, interaction.channel as never, em).catch(() => {});
  (await import("./quests.js")).incrementQuestProgress(interaction.guild.id, interaction.user.id, "daily").catch(() => {});
  (await import("./quests.js")).incrementQuestProgress(interaction.guild.id, interaction.user.id, "earn_coins", total).catch(() => {});

  const flavorLine  = streakLine(streak);
  const pInfo       = getPrestigeInfo(eco.prestige);
  const embedColor  = eco.prestige > 0 ? pInfo.color : THEME.economy;

  const descParts: string[] = [];
  if (flavorLine) descParts.push(flavorLine);
  if (eco.prestige > 0) descParts.push(`> *${pInfo.badge} ${pInfo.title} — +${Math.round(eco.prestige * PRESTIGE_BONUS * 100)}% prestige multiplier applied*`);
  descParts.push(SEP);

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({ name: `${em}  Daily Reward  ·  ${BOT_NAME}`, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(descParts.join("\n"))
    .addFields(
      { name: "◈ Base",        value: `+${base.toLocaleString()} ${em}`,    inline: true },
      { name: "◈ Streak Bonus", value: bonus > 0 ? `+${bonus.toLocaleString()} ${em}` : "—", inline: true },
      { name: "◈ Total",        value: `**+${total.toLocaleString()} ${em}** ${baseName}`, inline: true },
      { name: "◈ Balance",      value: `${newBal.toLocaleString()} ${em}`,   inline: true },
      { name: "◈ Streak",       value: `🔥 **${streak}** day${streak !== 1 ? "s" : ""}`,  inline: true },
    )
    .setFooter({ text: `Next transmission in 20h  ·  ${BOT_NAME} ◆ Economy` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
