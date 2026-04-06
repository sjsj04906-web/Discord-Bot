import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getLeaderboard } from "../db.js";
import { levelFromXp } from "../utils/xpMath.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the server XP leaderboard")
  .addIntegerOption((o) =>
    o.setName("page").setDescription("Page number (10 per page)").setMinValue(1).setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const page   = (interaction.options.getInteger("page") ?? 1) - 1;
  const limit  = 10;
  const offset = page * limit;

  const rows = await getLeaderboard(interaction.guild.id, limit, offset);

  if (rows.length === 0) {
    await interaction.editReply({ content: page > 0 ? "No more entries." : "No XP recorded yet." });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines  = rows.map((r, i) => {
    const rank   = offset + i + 1;
    const medal  = medals[i] && page === 0 ? medals[i]! : `\`#${rank}\``;
    const level  = levelFromXp(r.xp);
    return `${medal} <@${r.userId}>  —  **Lv ${level}**  ·  ${r.xp.toLocaleString()} XP  ·  ${r.messageCount.toLocaleString()} msgs`;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setAuthor({ name: `🏆  XP Leaderboard  ·  ${BOT_NAME}` })
    .setTitle(interaction.guild.name)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page + 1}  ·  use /leaderboard page:2 for more` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
