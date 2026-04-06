import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getOrCreateXp, getGuildRank, getLevelRoles } from "../db.js";
import { levelFromXp, xpProgressInLevel } from "../utils/xpMath.js";

function progressBar(current: number, total: number, length = 16): string {
  const filled = Math.round((current / total) * length);
  return `[${"█".repeat(filled)}${"░".repeat(length - filled)}]`;
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

  const currentRole = [...roles].reverse().find((r) => r.level <= level);
  const nextRole    = roles.find((r) => r.level > level);

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setAuthor({ name: `📊  Rank Card  ·  ${BOT_NAME}` })
    .setThumbnail(target.displayAvatarURL())
    .setTitle(target.tag)
    .addFields(
      { name: "Level",       value: `**${level}**`,                           inline: true },
      { name: "Server Rank", value: `**#${rank}**`,                           inline: true },
      { name: "Total XP",    value: `**${record.xp.toLocaleString()}**`,      inline: true },
      { name: "Messages",    value: `**${record.messageCount.toLocaleString()}**`, inline: true },
      { name: "Current Role",value: currentRole ? currentRole.roleName : "None", inline: true },
      { name: "Next Role",   value: nextRole ? `${nextRole.roleName} (level ${nextRole.level})` : "Max rank reached!", inline: true },
      {
        name:  `Progress to Level ${level + 1}`,
        value: `${progressBar(current, needed)} **${current.toLocaleString()}** / **${needed.toLocaleString()}** XP`,
        inline: false,
      },
    )
    .setFooter({ text: `${BOT_NAME}  ·  XP earned from chatting` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
