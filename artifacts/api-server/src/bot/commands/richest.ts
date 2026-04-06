import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { BOT_NAME } from "../theme.js";
import { getGuildConfig, getEconomyLeaderboard } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("richest")
  .setDescription("View the richest users in the server")
  .addIntegerOption((o) =>
    o.setName("page").setDescription("Page number").setRequired(false).setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const page = (interaction.options.getInteger("page") ?? 1) - 1;
  const limit = 10;
  const config = await getGuildConfig(interaction.guild.id);
  const em = config.currencyEmoji;
  const rows = await getEconomyLeaderboard(interaction.guild.id, limit, page * limit);

  if (rows.length === 0) {
    await interaction.reply({ content: "No economy data yet!", ephemeral: true });
    return;
  }

  // Ghost Cloak — filter out users actively cloaked from the leaderboard
  const { hasActiveItem } = await import("./market.js");
  const visibleRows = (await Promise.all(
    rows.map(async (r) => ({ r, hidden: await hasActiveItem(interaction.guild.id, r.userId, "ghost_cloak").catch(() => false) }))
  )).filter((x) => !x.hidden).map((x) => x.r);

  if (visibleRows.length === 0) {
    await interaction.reply({ content: "No economy data yet!", ephemeral: true });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = visibleRows.map((r, i) => {
    const pos = page * limit + i + 1;
    const icon = i < 3 && page === 0 ? medals[i]! : `\`#${pos}\``;
    return `${icon} <@${r.userId}> — **${r.balance.toLocaleString()}** ${em}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: `${em}  Richest Users  ·  ${BOT_NAME}` })
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Page ${page + 1}  ·  ${BOT_NAME} Economy` })
        .setTimestamp(),
    ],
  });
}
