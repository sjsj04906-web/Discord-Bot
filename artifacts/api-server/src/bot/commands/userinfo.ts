import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

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

  const allWarnings = await getWarnings(interaction.guild.id, target.id);
  const automodCount = allWarnings.filter((w) => w.moderatorTag === BOT_NAME).length;
  const manualCount  = allWarnings.length - automodCount;

  const topRoles = member?.roles.cache
    .filter((r) => r.id !== interaction.guild!.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `${r}`)
    .slice(0, 10)
    .join(" ") || "None";

  const flags = target.flags?.toArray() ?? [];
  const badges: string[] = [];
  if (flags.includes("Staff"))             badges.push("Discord Staff");
  if (flags.includes("Partner"))           badges.push("Partner");
  if (flags.includes("BugHunterLevel1"))   badges.push("Bug Hunter");
  if (flags.includes("ActiveDeveloper"))   badges.push("Active Developer");
  if (flags.includes("VerifiedDeveloper")) badges.push("Verified Bot Dev");
  if (target.bot)                          badges.push("Bot");

  let violationText = "Clean";
  if (allWarnings.length > 0) {
    const parts: string[] = [];
    if (manualCount > 0)  parts.push(`${manualCount} manual`);
    if (automodCount > 0) parts.push(`${automodCount} automod`);
    violationText = `⚠️  ${parts.join("  ·  ")}`;
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.userinfo)
    .setAuthor({ name: `Member Profile  ·  ${BOT_NAME}` })
    .setTitle(target.tag)
    .setURL(`https://discord.com/users/${target.id}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "User ID",      value: `\`${target.id}\``, inline: true },
      { name: "Account Age",  value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Badges",       value: badges.length > 0 ? badges.join(", ") : "None", inline: true },
    )
    .setTimestamp();

  if (member) {
    embed.addFields(
      { name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true },
      { name: "Nickname",      value: member.nickname ?? "None", inline: true },
      { name: "Warnings",      value: violationText, inline: true },
      { name: `Roles (${member.roles.cache.size - 1})`, value: topRoles },
    );
  }

  await interaction.reply({ embeds: [embed] });
}
