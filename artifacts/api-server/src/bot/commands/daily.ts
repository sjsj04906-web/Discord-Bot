import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastDaily } from "../db.js";

const DAILY_MS = 20 * 60 * 60 * 1000;
const STREAK_RESET_MS = 48 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily coin reward");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco = await getBalance(interaction.guild.id, interaction.user.id);
  const em = config.currencyEmoji;
  const baseName = config.currencyName;
  const base = config.dailyAmount;

  const now = Date.now();
  if (eco.lastDaily && now - eco.lastDaily.getTime() < DAILY_MS) {
    const next = eco.lastDaily.getTime() + DAILY_MS;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`⏳ You already claimed your daily. Come back <t:${Math.floor(next / 1000)}:R>!`),
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

  const bonus = Math.floor(base * 0.1 * Math.min(streak - 1, 10));
  const total = base + bonus;

  await updateLastDaily(interaction.guild.id, interaction.user.id, streak);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, total);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: `${em}  Daily Reward  ·  ${BOT_NAME}` })
    .setDescription(`You claimed your daily reward!`)
    .addFields(
      { name: "Base Reward",   value: `+${base} ${em}`,                  inline: true },
      { name: "Streak Bonus",  value: bonus > 0 ? `+${bonus} ${em}` : "None", inline: true },
      { name: "Total Earned",  value: `+${total} ${em} ${baseName}`,       inline: true },
      { name: "New Balance",   value: `${newBal.toLocaleString()} ${em}`, inline: true },
      { name: "Current Streak", value: `🔥 ${streak} day${streak !== 1 ? "s" : ""}`, inline: true },
    )
    .setFooter({ text: `Next daily available in 20 hours` })
    .setTimestamp();

  if (streak >= 7)  embed.setDescription(`You claimed your daily! 🔥 **${streak}-day streak** — keep it going!`);
  if (streak >= 30) embed.setDescription(`🏆 Legendary! You claimed your daily with a **${streak}-day streak!**`);

  await interaction.reply({ embeds: [embed] });
}
