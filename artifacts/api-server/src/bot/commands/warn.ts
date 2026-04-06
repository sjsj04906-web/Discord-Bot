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
import { randomWarnLine } from "../utils/savagelines.js";

const MUTE_THRESHOLD = 5;

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue a formal warning to a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The member to warn").setRequired(true)
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

  let dmFailed = false;
  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setAuthor({ name: `⚠️  Formal Warning  ·  ${BOT_NAME}` })
          .setDescription(`You have received a warning in **${interaction.guild.name}**.`)
          .addFields(
            { name: "◈ Reason",         value: reason },
            { name: "◈ Warning Count",  value: `${total} of ${MUTE_THRESHOLD} (auto-mute threshold)`, inline: true },
          )
          .setFooter({ text: `${BOT_NAME}  ◆  Moderation` })
          .setTimestamp(),
      ],
    });
  } catch {
    dmFailed = true;
  }

  const nearThreshold = total === MUTE_THRESHOLD - 1;
  const embedColor    = total >= MUTE_THRESHOLD ? THEME.escalate : nearThreshold ? THEME.escalate : THEME.warn;

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({ name: `⚠️  Warning Issued  ·  ${BOT_NAME}` })
    .setTitle(target.tag)
    .setURL(`https://discord.com/users/${target.id}`)
    .setDescription(`> *"${randomWarnLine()}"*`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "◈ Member",    value: `${target}`,           inline: true },
      { name: "◈ Moderator", value: `${interaction.user}`, inline: true },
      { name: "◈ Strike",    value: `**#${total}**${nearThreshold ? "  ⚡" : ""}`, inline: true },
      { name: "◈ Reason",    value: reason },
    )
    .setFooter({
      text: `User ID: ${target.id}  ·  ${dmFailed ? "DM failed" : "Member notified"}  ·  ${BOT_NAME} ◆ Moderation`,
    })
    .setTimestamp();

  const notices: string[] = [];
  if (dmFailed)       notices.push(`> ⚠️ Could not DM this member — their messages are closed.`);
  if (nearThreshold)  notices.push(`> ⚡ **${target.username}** is one strike from the auto-mute threshold.`);

  await interaction.reply({ embeds: [embed], content: notices.length ? notices.join("\n") : undefined });
  log.warn(target.tag, interaction.guild.name, total, reason);

  await sendModLog(interaction.guild, {
    action: "⚠️  Warning Issued",
    color: embedColor,
    target,
    moderator: interaction.user,
    reason,
    extra: {
      "Strike Count": nearThreshold ? `${total} — one from auto-mute` : String(total),
    },
  });
}
