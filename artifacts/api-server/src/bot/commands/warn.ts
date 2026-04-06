import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { addWarning, countWarnings } from "../db.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";

const MUTE_THRESHOLD = 5;

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue a warning to a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to warn").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the warning").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await addWarning(interaction.guild.id, target.id, reason, interaction.user.tag);
  const total = await countWarnings(interaction.guild.id, target.id);

  let dmNote = "";
  try {
    await target.send(
      `⚠️ **Warning from ${interaction.guild.name}**\n\n**Reason:** ${reason}\n**Warning count:** ${total}`
    );
  } catch {
    dmNote = "Could not DM this member — their direct messages are closed.";
  }

  const nearThreshold = total === MUTE_THRESHOLD - 1;

  const embed = new EmbedBuilder()
    .setColor(nearThreshold ? THEME.escalate : THEME.warn)
    .setAuthor({ name: `⚠️  Member Warned  ·  ${BOT_NAME}` })
    .setTitle(target.tag)
    .setURL(`https://discord.com/users/${target.id}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Member",       value: `${target}`, inline: true },
      { name: "Moderator",    value: `${interaction.user}`, inline: true },
      { name: "Warning #",    value: `${total}${nearThreshold ? "  ⚡" : ""}`, inline: true },
    )
    .addFields({ name: "Reason", value: reason })
    .setFooter({ text: `ID: ${target.id}${dmNote ? "  ·  DM failed" : "  ·  Member notified"}` })
    .setTimestamp();

  const extras: string[] = [];
  if (dmNote) extras.push(`> ⚠️ ${dmNote}`);
  if (nearThreshold) extras.push(`> ⚡ **${target.username}** is one warning away from the auto-mute threshold.`);

  await interaction.reply({ embeds: [embed], content: extras.length ? extras.join("\n") : undefined });
  log.warn(target.tag, interaction.guild.name, total, reason);

  await sendModLog(interaction.guild, {
    action: "⚠️  Member Warned",
    color: THEME.warn,
    target,
    moderator: interaction.user,
    reason,
    extra: {
      "Warning Count": nearThreshold ? `${total} — one away from auto-mute` : String(total),
    },
  });
}
