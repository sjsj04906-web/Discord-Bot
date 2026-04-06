import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastHourly } from "../db.js";
import { PRESTIGE_BONUS } from "./prestige.js";

const HOURLY_MS = 60 * 60 * 1000;
const HOURLY_AMOUNT = 50;

export const data = new SlashCommandBuilder()
  .setName("hourly")
  .setDescription("Claim a small hourly coin reward");

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
          .setDescription(`⏳ Hourly already claimed. Come back <t:${Math.floor(next / 1000)}:R>!`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const multiplier = 1 + eco.prestige * PRESTIGE_BONUS;
  const payout     = Math.floor(HOURLY_AMOUNT * multiplier);

  await updateLastHourly(interaction.guild.id, interaction.user.id);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, payout);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00FFCC)
        .setAuthor({ name: `⚡  Hourly Reward  ·  ${BOT_NAME}` })
        .setDescription(`You jacked into the grid and snagged your hourly payout.`)
        .addFields(
          { name: "Earned",      value: `+${payout} ${em}`,                    inline: true },
          { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`,     inline: true },
        )
        .setFooter({ text: `Next hourly available in 1 hour` })
        .setTimestamp(),
    ],
  });
}
