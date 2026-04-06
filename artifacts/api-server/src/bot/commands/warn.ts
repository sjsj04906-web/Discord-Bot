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

// Mirror of ESCALATION thresholds from automod.ts
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

  let dmStatus = "";
  try {
    await target.send(
      `⚠️ **${BOT_NAME} // VIOLATION NOTICE**\n\nYou have been warned in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Warning #:** ${total}`
    );
  } catch {
    dmStatus = "\n> ⚠️ Could not DM this user — their direct messages are closed.";
  }

  // ── Proximity notice (one away from auto-mute) ────────────────────────────
  const proximityNote = total === MUTE_THRESHOLD - 1
    ? `\n> ⚡ **Heads up:** ${target.username} is **1 warning away** from the automatic ${MUTE_THRESHOLD}-warning mute threshold.`
    : "";

  const embed = new EmbedBuilder()
    .setColor(total >= MUTE_THRESHOLD - 1 ? THEME.escalate : THEME.warn)
    .setTitle("⚠️ // VIOLATION LOGGED")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "TARGET",    value: `${target} \`${target.tag}\``, inline: true },
      { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
      { name: "WARNING #", value: `${total}${total === MUTE_THRESHOLD - 1 ? " ⚡" : ""}`, inline: true },
      { name: "REASON",    value: reason },
    )
    .setFooter({ text: `ID: ${target.id}${dmStatus ? " • DM failed" : " • User notified via DM"}` })
    .setTimestamp();

  const content = [dmStatus, proximityNote].filter(Boolean).join("\n") || undefined;
  await interaction.reply({ embeds: [embed], content });
  log.warn(target.tag, interaction.guild.name, total, reason);

  await sendModLog(interaction.guild, {
    action: "⚠️ WARN // VIOLATION LOGGED",
    color: THEME.warn,
    target,
    moderator: interaction.user,
    reason,
    extra: {
      "TOTAL WARNINGS": `${total}${total === MUTE_THRESHOLD - 1 ? " ⚡ (1 away from auto-mute)" : ""}`,
    },
  });
}
