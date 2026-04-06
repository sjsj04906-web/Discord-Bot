import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { warnings } from "../warnings.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("View detailed information about a user")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("user") ?? interaction.user;
  const member = interaction.guild.members.cache.get(target.id);

  const key = `${interaction.guild.id}:${target.id}`;
  const warnCount = warnings.get(key)?.length ?? 0;

  const roles = member?.roles.cache
    .filter((r) => r.id !== interaction.guild!.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `${r}`)
    .slice(0, 10)
    .join(" ") || "None";

  const flags = target.flags?.toArray() ?? [];
  const badges: string[] = [];
  if (flags.includes("Staff")) badges.push("Discord Staff");
  if (flags.includes("Partner")) badges.push("Partner");
  if (flags.includes("BugHunterLevel1")) badges.push("Bug Hunter");
  if (flags.includes("ActiveDeveloper")) badges.push("Active Developer");
  if (flags.includes("VerifiedDeveloper")) badges.push("Verified Bot Dev");
  if (target.bot) badges.push("Bot");

  const embed = new EmbedBuilder()
    .setColor(THEME.userinfo)
    .setTitle(`◈ // ENTITY PROFILE: ${target.tag}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "USER ID", value: `\`${target.id}\``, inline: true },
      { name: "ACCOUNT AGE", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "FLAGS", value: badges.length > 0 ? badges.join(", ") : "None", inline: true },
    )
    .setTimestamp();

  if (member) {
    embed.addFields(
      { name: "JOINED", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true },
      { name: "NICKNAME", value: member.nickname ?? "None", inline: true },
      { name: "VIOLATIONS", value: warnCount === 0 ? "✅ Clean" : `⚠️ ${warnCount} on record`, inline: true },
      { name: `ROLES (${member.roles.cache.size - 1})`, value: roles },
    );
  }

  await interaction.reply({ embeds: [embed] });
}
