import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getOrCreateXp, getGuildRank, getLevelRoles } from "../db.js";
import { levelFromXp, xpProgressInLevel } from "../utils/xpMath.js";

const BAR_FILLED = "▰";
const BAR_EMPTY  = "▱";

function progressBar(current: number, total: number, length = 18): string {
  const filled = Math.round((current / total) * length);
  return `${BAR_FILLED.repeat(filled)}${BAR_EMPTY.repeat(length - filled)}`;
}

function rankTier(rank: number): string {
  if (rank === 1)   return "👑";
  if (rank <= 3)    return "⭐";
  if (rank <= 10)   return "🔥";
  if (rank <= 25)   return "⚡";
  return "◈";
}

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Show your XP rank card or another member's")
  .addUserOption((o) => o.setName("user").setDescription("Member to check").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const target  = interaction.options.getUser("user") ?? interaction.user;
  const record  = await getOrCreateXp(interaction.guild.id, target.id);
  const rank    = await getGuildRank(interaction.guild.id, target.id);
  const roles   = await getLevelRoles(interaction.guild.id);

  const level   = levelFromXp(record.xp);
  const { current, needed } = xpProgressInLevel(record.xp);
  const pct     = Math.floor((current / needed) * 100);

  const currentRole = [...roles].reverse().find((r) => r.level <= level);
  const nextRole    = roles.find((r) => r.level > level);

  const barStr  = `\`${progressBar(current, needed)}\` **${pct}%**`;
  const tierIcon = rankTier(rank);

  const embed = new EmbedBuilder()
    .setColor(THEME.xp)
    .setAuthor({ name: `${tierIcon}  Neural Profile  ·  ${BOT_NAME}`, iconURL: target.displayAvatarURL() })
    .setThumbnail(target.displayAvatarURL())
    .setTitle(`${target.tag}`)
    .addFields(
      { name: "◈ Level",    value: `**${level}**`,                              inline: true },
      { name: "◈ Rank",     value: `**${tierIcon} #${rank}**`,                  inline: true },
      { name: "◈ Total XP", value: `**${record.xp.toLocaleString()}** XP`,      inline: true },
      { name: "◈ Messages", value: `**${record.messageCount.toLocaleString()}**`, inline: true },
      { name: "◈ Current Title", value: currentRole ? `<@&${currentRole.roleId}>` : "*None*", inline: true },
      { name: "◈ Next Title",    value: nextRole ? `<@&${nextRole.roleId}> at level ${nextRole.level}` : "*Maximum rank achieved*", inline: true },
      {
        name:  `Progress to Level ${level + 1}`,
        value: `${barStr}\n**${current.toLocaleString()}** / **${needed.toLocaleString()}** XP`,
        inline: false,
      },
    )
    .setFooter({ text: `${BOT_NAME}  ◆  XP earned through activity` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
