import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";
import { parseDuration, formatDuration } from "../utils/duration.js";

export const data = new SlashCommandBuilder()
  .setName("tempmute")
  .setDescription("Temporarily mute a member for a set duration")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to mute").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("duration").setDescription("Duration e.g. 10m 1h 2d (max 28d)").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the mute").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target      = interaction.options.getUser("user", true);
  const durationStr = interaction.options.getString("duration", true);
  const reason      = interaction.options.getString("reason") ?? "No reason provided";

  const ms = parseDuration(durationStr);
  if (!ms || ms <= 0) {
    await interaction.reply({ content: "Invalid duration. Try `10m`, `2h`, `1d`.", ephemeral: true });
    return;
  }
  const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
  if (ms > MAX_TIMEOUT_MS) {
    await interaction.reply({ content: "Maximum temp mute duration is 28 days.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "Member not found in this server.", ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({ content: "I cannot mute this member — they may have a higher role.", ephemeral: true });
    return;
  }

  await member.timeout(ms, reason);

  const label = formatDuration(ms);
  const expiresAt = new Date(Date.now() + ms);

  let dmStatus = "";
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(THEME.mute)
      .setTitle(`🔇 ${BOT_NAME} // TEMPORARY MUTE`)
      .setDescription(`You have been muted in **${interaction.guild.name}** for **${label}**.`)
      .addFields(
        { name: "REASON",   value: reason },
        { name: "EXPIRES",  value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
      )
      .setTimestamp();
    await target.send({ embeds: [dmEmbed] });
  } catch {
    dmStatus = "\n> ⚠️ Could not DM this user.";
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.mute)
    .setTitle("🔇 // TEMP MUTE APPLIED")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "TARGET",   value: `${target} \`${target.tag}\``, inline: true },
      { name: "OPERATOR", value: `${interaction.user}`, inline: true },
      { name: "DURATION", value: label, inline: true },
      { name: "EXPIRES",  value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
      { name: "REASON",   value: reason },
    )
    .setFooter({ text: `ID: ${target.id}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], content: dmStatus || undefined });

  await sendModLog(interaction.guild, {
    action: "🔇 TEMP MUTE // COMMS RESTRICTED",
    color: THEME.mute,
    target,
    moderator: interaction.user,
    reason,
    duration: label,
    extra: { EXPIRES: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
  });
}
