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
    await interaction.reply({ content: "That member isn't in this server.", ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({ content: "I don't have permission to mute this member.", ephemeral: true });
    return;
  }

  await member.timeout(ms, reason);

  const label = formatDuration(ms);
  const expiresAt = new Date(Date.now() + ms);
  const expiresTs = Math.floor(expiresAt.getTime() / 1000);

  let dmNote = "";
  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.mute)
          .setAuthor({ name: `🔇  You've been muted  ·  ${BOT_NAME}` })
          .setTitle(interaction.guild.name)
          .setDescription(`You have been temporarily muted for **${label}**.`)
          .addFields(
            { name: "Reason",  value: reason },
            { name: "Expires", value: `<t:${expiresTs}:F>` },
          )
          .setTimestamp(),
      ],
    });
  } catch {
    dmNote = "Could not DM this member.";
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.mute)
    .setAuthor({ name: `🔇  Temporary Mute  ·  ${BOT_NAME}` })
    .setTitle(target.tag)
    .setURL(`https://discord.com/users/${target.id}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Member",    value: `${target}`, inline: true },
      { name: "Moderator", value: `${interaction.user}`, inline: true },
      { name: "Duration",  value: label, inline: true },
      { name: "Expires",   value: `<t:${expiresTs}:R>`, inline: true },
      { name: "Reason",    value: reason },
    )
    .setFooter({ text: `ID: ${target.id}${dmNote ? "  ·  DM failed" : "  ·  Member notified"}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], content: dmNote ? `> ⚠️ ${dmNote}` : undefined });

  await sendModLog(interaction.guild, {
    action: "🔇  Temporary Mute",
    color: THEME.mute,
    target,
    moderator: interaction.user,
    reason,
    duration: label,
    extra: { "Expires": `<t:${expiresTs}:R>` },
  });
}
