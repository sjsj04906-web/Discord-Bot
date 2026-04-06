import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getModStats } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("modstats")
  .setDescription("Show moderation action leaderboard for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const rows = await getModStats(interaction.guild.id);

  if (rows.length === 0) {
    await interaction.editReply({ content: "No moderation actions recorded yet." });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.slice(0, 10).map((r, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    const name  = r.moderatorTag ?? `<@${r.moderatorId}>`;
    return `${medal} ${name} — **${r.total}** action${Number(r.total) !== 1 ? "s" : ""}`;
  });

  // Action breakdown
  const breakdown = rows.slice(0, 10).map((r) => {
    const parts: string[] = [];
    if (r.bans)     parts.push(`${r.bans}b`);
    if (r.kicks)    parts.push(`${r.kicks}k`);
    if (r.mutes)    parts.push(`${r.mutes}m`);
    if (r.warns)    parts.push(`${r.warns}w`);
    return `\`${(r.moderatorTag ?? r.moderatorId).slice(0, 16).padEnd(16)}\` ${parts.join(" | ")}`;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setAuthor({ name: `📊  Mod Stats  ·  ${BOT_NAME}` })
    .setTitle(`Moderation Leaderboard — ${interaction.guild.name}`)
    .addFields(
      { name: "Ranking (all time)", value: lines.join("\n") || "None", inline: false },
      { name: "Breakdown  (b=ban k=kick m=mute w=warn)", value: breakdown.join("\n") || "None", inline: false },
    )
    .setFooter({ text: `Top ${Math.min(rows.length, 10)} of ${rows.length} moderator${rows.length !== 1 ? "s" : ""}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
