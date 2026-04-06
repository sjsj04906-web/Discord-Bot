import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from "discord.js";
import { warnings } from "../warnings.js";

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

  const badges: string[] = [];
  const flags = target.flags?.toArray() ?? [];
  if (flags.includes("Staff")) badges.push("Discord Staff");
  if (flags.includes("Partner")) badges.push("Partner");
  if (flags.includes("HypeSquadOnlineHouse1")) badges.push("HypeSquad Bravery");
  if (flags.includes("HypeSquadOnlineHouse2")) badges.push("HypeSquad Brilliance");
  if (flags.includes("HypeSquadOnlineHouse3")) badges.push("HypeSquad Balance");
  if (flags.includes("BugHunterLevel1")) badges.push("Bug Hunter");
  if (flags.includes("ActiveDeveloper")) badges.push("Active Developer");
  if (flags.includes("VerifiedDeveloper")) badges.push("Verified Bot Developer");
  if (target.bot) badges.push("Bot");

  const statusColor = member?.presence?.status === "online" ? Colors.Green
    : member?.presence?.status === "idle" ? Colors.Yellow
    : member?.presence?.status === "dnd" ? Colors.Red
    : Colors.Grey;

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || Colors.Blurple)
    .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "User ID", value: `\`${target.id}\``, inline: true },
      { name: "Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Badges", value: badges.length > 0 ? badges.join(", ") : "None", inline: true },
    )
    .setTimestamp();

  if (member) {
    embed.addFields(
      { name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true },
      { name: "Nickname", value: member.nickname ?? "None", inline: true },
      { name: "Warnings", value: warnCount === 0 ? "✅ None" : `⚠️ ${warnCount}`, inline: true },
      { name: `Roles (${member.roles.cache.size - 1})`, value: roles },
    );
  }

  await interaction.reply({ embeds: [embed] });
}
