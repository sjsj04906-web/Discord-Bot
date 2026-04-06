import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig } from "../db.js";
import { getUnlockedAchievements } from "../db.js";
import { ACHIEVEMENTS } from "../lib/achievements.js";

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View your unlocked achievements and progress")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to check (defaults to you)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const target = interaction.options.getUser("user") ?? interaction.user;
  const config  = await getGuildConfig(interaction.guild.id);
  const em      = config.currencyEmoji;

  const unlocked = await getUnlockedAchievements(interaction.guild.id, target.id);
  const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

  const totalReward = ACHIEVEMENTS
    .filter((a) => unlockedMap.has(a.id))
    .reduce((sum, a) => sum + a.reward, 0);

  const lines = ACHIEVEMENTS.map((ach) => {
    const unlockedAt = unlockedMap.get(ach.id);
    if (unlockedAt) {
      return `✅ **${ach.emoji} ${ach.name}** — *${ach.desc}* ・ +${ach.reward.toLocaleString()} ${em}\n   ↳ Unlocked <t:${Math.floor(unlockedAt.getTime() / 1000)}:R>`;
    }
    return `🔒 **${ach.emoji} ${ach.name}** — *${ach.desc}* ・ +${ach.reward.toLocaleString()} ${em}`;
  });

  const chunkSize = 8;
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize));
  }

  const embeds = chunks.map((chunk, i) =>
    new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor(i === 0 ? { name: `🏅  Achievements  ·  ${target.username}`, iconURL: target.displayAvatarURL() } : null as never)
      .setDescription(chunk.join("\n\n"))
      .setFooter(i === chunks.length - 1 ? {
        text: `${unlockedMap.size} / ${ACHIEVEMENTS.length} unlocked  ·  ${totalReward.toLocaleString()} ${em} earned from achievements`,
      } : null as never)
  );

  await interaction.reply({ embeds, ephemeral: false });
}
