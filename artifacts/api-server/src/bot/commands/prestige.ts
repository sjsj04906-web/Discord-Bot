import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, incrementPrestige } from "../db.js";

export const MAX_PRESTIGE    = 10;
export const PRESTIGE_REQ    = 500_000;
export const PRESTIGE_BONUS  = 0.10;

export function prestigeBadge(level: number): string {
  if (level <= 0)  return "";
  if (level === 10) return "⚜️";
  if (level >= 7)  return `${"🌟".repeat(level - 6)} `;
  if (level >= 4)  return `${"⭐".repeat(level - 3)} `;
  return `${"✦".repeat(level)} `;
}

export const data = new SlashCommandBuilder()
  .setName("prestige")
  .setDescription(`Reset your wallet for a permanent income bonus (+${PRESTIGE_BONUS * 100}% per level)`);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  if (eco.prestige >= MAX_PRESTIGE) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`⚜️ You've already reached max prestige (${MAX_PRESTIGE}). You are a legend.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (eco.balance < PRESTIGE_REQ) {
    const needed = PRESTIGE_REQ - eco.balance;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setAuthor({ name: `🔄  Prestige  ·  ${BOT_NAME}` })
          .setDescription(`You need **${PRESTIGE_REQ.toLocaleString()} ${em}** in your wallet to prestige.`)
          .addFields(
            { name: "Your Wallet", value: `${eco.balance.toLocaleString()} ${em}`, inline: true },
            { name: "Still Need",  value: `${needed.toLocaleString()} ${em}`,      inline: true },
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const nextLevel = eco.prestige + 1;
  const badge     = prestigeBadge(nextLevel);
  const bonus     = Math.round(nextLevel * PRESTIGE_BONUS * 100);

  const { newBalance } = await incrementPrestige(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: `🔄  Prestige Unlocked!  ·  ${BOT_NAME}` })
        .setDescription(`You sacrificed your wallet and ascended.\n\n**${badge}Prestige ${nextLevel}** achieved!`)
        .addFields(
          { name: "Wallet Reset To", value: `${newBalance.toLocaleString()} ${em}`, inline: true },
          { name: "Bank Untouched",  value: `${eco.bankBalance.toLocaleString()} ${em}`, inline: true },
          { name: "Income Bonus",    value: `+${bonus}% on work, daily & hourly`, inline: false },
        )
        .setFooter({ text: `Max prestige is ${MAX_PRESTIGE}  ·  ${PRESTIGE_BONUS * 100}% bonus per level` })
        .setTimestamp(),
    ],
  });
}
