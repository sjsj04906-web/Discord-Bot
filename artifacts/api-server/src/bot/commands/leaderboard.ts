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
    await interaction.editReply({ content: page > 0 ? "No more entries on this page." : "No XP recorded yet." });
    return;
  }

  const TIER_ICONS = ["👑", "⭐", "🏅", "◈", "◈"];
  const lines = rows.map((r, i) => {
    const rank    = offset + i + 1;
    const icon    = page === 0 && i < 3 ? TIER_ICONS[i]! : `\`#${rank}\``;
    const level   = levelFromXp(r.xp);
    const xpStr   = r.xp.toLocaleString();
    const msgStr  = r.messageCount.toLocaleString();
    return `${icon}  <@${r.userId}> — **Lv ${level}** ・ ${xpStr} XP ・ ${msgStr} msgs`;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME.xp)
    .setAuthor({ name: `🏆  XP Leaderboard  ·  ${BOT_NAME}` })
    .setTitle(interaction.guild.name)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page + 1}  ·  /leaderboard page:2 for more  ·  ${BOT_NAME} ◆ XP` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
