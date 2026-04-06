import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, getEconomyRank } from "../db.js";
import { prestigeBadge } from "./prestige.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your coin balance")
  .addUserOption((o) => o.setName("user").setDescription("User to check (default: you)").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const target = interaction.options.getUser("user") ?? interaction.user;
  const config = await getGuildConfig(interaction.guild.id);
  const eco = await getBalance(interaction.guild.id, target.id);
  const rank = await getEconomyRank(interaction.guild.id, target.id);
  const em = config.currencyEmoji;
  const name = config.currencyName;

  const netWorth = eco.balance + eco.bankBalance;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: `${em}  ${prestigeBadge(eco.prestige)}${target.username}'s Balance  ·  ${BOT_NAME}` })
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "👜 Wallet",    value: `**${eco.balance.toLocaleString()}** ${em}`,     inline: true },
          { name: "🏦 Bank",      value: `**${eco.bankBalance.toLocaleString()}** ${em}`, inline: true },
          { name: "💰 Net Worth", value: `${netWorth.toLocaleString()} ${em} ${name}`,    inline: true },
          { name: "Total Earned", value: `${eco.totalEarned.toLocaleString()} ${em}`,     inline: true },
          { name: "Server Rank",  value: `#${rank}`,                                      inline: true },
          { name: "Daily Streak", value: `🔥 ${eco.dailyStreak} day${eco.dailyStreak !== 1 ? "s" : ""}`, inline: true },
          { name: "Prestige",     value: eco.prestige > 0 ? `${prestigeBadge(eco.prestige)}Level ${eco.prestige}` : "None", inline: true },
        )
        .setFooter({ text: `${BOT_NAME}  ·  Economy  ·  Bank is safe from /rob` })
        .setTimestamp(),
    ],
    flags: target.id !== interaction.user.id ? undefined : MessageFlags.Ephemeral,
  });
}
