import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getServerStats } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("View GL1TCH bot statistics for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const stats = await getServerStats(interaction.guild.id);
  const uptime = interaction.client.uptime ?? 0;

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setTitle(`📊 // ${BOT_NAME} SYSTEM STATS`)
    .addFields(
      { name: "⏱ UPTIME",            value: formatUptime(uptime), inline: true },
      { name: "🌐 GUILDS",            value: String(interaction.client.guilds.cache.size), inline: true },
      { name: "👥 MEMBERS",           value: String(interaction.guild.memberCount), inline: true },
      { name: "⚠️ TOTAL WARNINGS",    value: String(stats.totalWarnings), inline: true },
      { name: "🛡 AUTOMOD INTERCEPTS", value: String(stats.automodIntercepts), inline: true },
      { name: "📋 MOD CASES",         value: String(stats.totalCases), inline: true },
      { name: "⏳ ACTIVE TEMP BANS",  value: String(stats.activeTempBans), inline: true },
      { name: "📝 TOTAL NOTES",       value: String(stats.totalNotes), inline: true },
      { name: "🚫 BANNED WORDS",      value: String(stats.bannedWords), inline: true },
    )
    .setFooter({ text: `${BOT_NAME} • Stats for this server only` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
