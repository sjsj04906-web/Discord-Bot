import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastHourly } from "../db.js";
import { PRESTIGE_BONUS, getPrestigeInfo } from "./prestige.js";

const HOURLY_MS     = 60 * 60 * 1000;
const HOURLY_AMOUNT = 50;

export const data = new SlashCommandBuilder()
  .setName("hourly")
  .setDescription("Tap into the grid for a small hourly payout");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  const now = Date.now();
  if (eco.lastHourly && now - eco.lastHourly.getTime() < HOURLY_MS) {
    const next = eco.lastHourly.getTime() + HOURLY_MS;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setAuthor({ name: `⚡  Hourly Reward  ·  ${BOT_NAME}` })
          .setDescription(`> Channel locked. Signal resets <t:${Math.floor(next / 1000)}:R>.`)
          .setFooter({ text: `${BOT_NAME}  ◆  Economy` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const multiplier = 1 + eco.prestige * PRESTIGE_BONUS;
  const payout     = Math.floor(HOURLY_AMOUNT * multiplier);
  const pInfo      = getPrestigeInfo(eco.prestige);

  await updateLastHourly(interaction.guild.id, interaction.user.id);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, payout);

  const desc = eco.prestige > 0
    ? `> You tapped the grid and collected your signal cut.\n> *${pInfo.badge} ${pInfo.title} — +${Math.round(eco.prestige * PRESTIGE_BONUS * 100)}% applied*`
    : `> You tapped the grid and collected your signal cut.`;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(eco.prestige > 0 ? pInfo.color : THEME.economy)
        .setAuthor({ name: `⚡  Hourly Payout  ·  ${BOT_NAME}` })
        .setDescription(desc)
        .addFields(
          { name: "◈ Earned",  value: `**+${payout.toLocaleString()}** ${em}`, inline: true },
          { name: "◈ Balance", value: `${newBal.toLocaleString()} ${em}`,      inline: true },
        )
        .setFooter({ text: `Next channel opens in 1 hour  ·  ${BOT_NAME} ◆ Economy` })
        .setTimestamp(),
    ],
  });
}
