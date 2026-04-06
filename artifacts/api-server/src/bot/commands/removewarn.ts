import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings, removeWarning, removeWarningsByIds, clearWarnings } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("removewarn")
  .setDescription("Remove one or more warnings from a member's record")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  // ── Subcommand: remove a single warning by number
  .addSubcommand((sub) =>
    sub
      .setName("number")
      .setDescription("Remove a single warning by its position number")
      .addUserOption((o) =>
        o.setName("user").setDescription("The user whose warning to remove").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("warning").setDescription("Warning number to remove (use /warnings to see the list)").setRequired(true).setMinValue(1)
      )
  )
  // ── Subcommand: remove a range of warnings
  .addSubcommand((sub) =>
    sub
      .setName("range")
      .setDescription("Remove a range of warnings (e.g. warnings #2 through #5)")
      .addUserOption((o) =>
        o.setName("user").setDescription("The user whose warnings to remove").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("from").setDescription("First warning number in the range").setRequired(true).setMinValue(1)
      )
      .addIntegerOption((o) =>
        o.setName("to").setDescription("Last warning number in the range").setRequired(true).setMinValue(1)
      )
  )
  // ── Subcommand: clear all warnings
  .addSubcommand((sub) =>
    sub
      .setName("all")
      .setDescription("Remove every warning from a member's record")
      .addUserOption((o) =>
        o.setName("user").setDescription("The user whose warnings to clear").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getUser("user", true);
  const guildId = interaction.guild.id;

  const warnings = await getWarnings(guildId, target.id);

  if (warnings.length === 0) {
    await interaction.reply({
      content: `${target.tag} has no warnings on record.`,
      ephemeral: true,
    });
    return;
  }

  // ── Single ──────────────────────────────────────────────────────────────────
  if (sub === "number") {
    const num = interaction.options.getInteger("warning", true);
    const warning = warnings[num - 1];

    if (!warning) {
      await interaction.reply({
        content: `Warning #${num} doesn't exist. ${target.tag} has **${warnings.length}** warning(s) — use \`/warnings\` to see them.`,
        ephemeral: true,
      });
      return;
    }

    await removeWarning(warning.id, guildId);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // WARNING REMOVED")
      .addFields(
        { name: "USER",      value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
        { name: "REMOVED",   value: `Warning #${num}`, inline: true },
        { name: "REASON",    value: warning.reason },
        { name: "REMAINING", value: `${warnings.length - 1} warning(s)`, inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── Range ───────────────────────────────────────────────────────────────────
  if (sub === "range") {
    const from = interaction.options.getInteger("from", true);
    const to   = interaction.options.getInteger("to", true);

    if (from > to) {
      await interaction.reply({
        content: `The **from** number (${from}) must be less than or equal to the **to** number (${to}).`,
        ephemeral: true,
      });
      return;
    }

    // clamp to actual list size
    const clampedTo = Math.min(to, warnings.length);
    const slice     = warnings.slice(from - 1, clampedTo);

    if (slice.length === 0) {
      await interaction.reply({
        content: `No warnings found in that range. ${target.tag} has **${warnings.length}** warning(s).`,
        ephemeral: true,
      });
      return;
    }

    const ids = slice.map((w) => w.id);
    await removeWarningsByIds(ids, guildId);

    const removedList = slice
      .map((w, i) => `**#${from + i}** — ${w.reason.slice(0, 60)}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle(`✅ // ${slice.length} WARNING(S) REMOVED`)
      .addFields(
        { name: "USER",      value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
        { name: "RANGE",     value: `#${from} → #${clampedTo}`, inline: true },
        { name: "REMOVED",   value: removedList },
        { name: "REMAINING", value: `${warnings.length - slice.length} warning(s)`, inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── All ─────────────────────────────────────────────────────────────────────
  if (sub === "all") {
    await clearWarnings(guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // ALL WARNINGS CLEARED")
      .addFields(
        { name: "USER",     value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        { name: "REMOVED",  value: `${warnings.length} warning(s)`, inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
