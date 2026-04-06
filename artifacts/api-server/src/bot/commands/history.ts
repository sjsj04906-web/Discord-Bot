import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings, getNotes, getPendingTempBans } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { db, casesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("View a user's full moderation history — warnings, notes, and bans")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("User to look up").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("user", true);
  const guildId = interaction.guild.id;

  const [warnings, notes, cases] = await Promise.all([
    getWarnings(guildId, target.id),
    getNotes(guildId, target.id),
    db.select().from(casesTable)
      .where(and(eq(casesTable.guildId, guildId), eq(casesTable.targetId, target.id)))
      .orderBy(desc(casesTable.createdAt))
      .limit(15),
  ]);

  const automodWarns = warnings.filter((w) => w.moderatorTag === BOT_NAME);
  const manualWarns  = warnings.filter((w) => w.moderatorTag !== BOT_NAME);

  const embed = new EmbedBuilder()
    .setColor(THEME.userinfo)
    .setTitle(`📁 // FULL HISTORY: ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(
      `**${warnings.length}** warning(s)  •  **${notes.length}** note(s)  •  **${cases.length}** case(s)`
    )
    .setTimestamp();

  // ── Manual warnings ────────────────────────────────────────────────────────
  if (manualWarns.length > 0) {
    embed.addFields({
      name: `⚠️ MANUAL WARNINGS (${manualWarns.length})`,
      value: manualWarns.slice(0, 5).map((w, i) =>
        `**#${i + 1}** ${w.reason} — \`${w.moderatorTag}\` <t:${Math.floor(w.createdAt.getTime() / 1000)}:d>`
      ).join("\n"),
    });
  }

  // ── Automod warnings ───────────────────────────────────────────────────────
  if (automodWarns.length > 0) {
    embed.addFields({
      name: `🛡 AUTOMOD VIOLATIONS (${automodWarns.length})`,
      value: automodWarns.slice(0, 5).map((w) =>
        `${w.reason.replace("[Auto-mod] ", "")} — <t:${Math.floor(w.createdAt.getTime() / 1000)}:d>`
      ).join("\n"),
    });
  }

  // ── Recent cases ───────────────────────────────────────────────────────────
  if (cases.length > 0) {
    embed.addFields({
      name: `📋 RECENT CASES (${cases.length})`,
      value: cases.slice(0, 8).map((c) =>
        `\`#${c.id}\` **${c.actionType}** — ${c.reason.slice(0, 50)} <t:${Math.floor(c.createdAt.getTime() / 1000)}:d>`
      ).join("\n"),
    });
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (notes.length > 0) {
    embed.addFields({
      name: `📝 MOD NOTES (${notes.length})`,
      value: notes.slice(0, 5).map((n) =>
        `${n.note.slice(0, 80)} — \`${n.moderatorTag}\` <t:${Math.floor(n.createdAt.getTime() / 1000)}:d>`
      ).join("\n"),
    });
  }

  if (warnings.length === 0 && notes.length === 0 && cases.length === 0) {
    embed.setDescription("✅ No moderation history found for this user.");
  }

  embed.setFooter({ text: `User ID: ${target.id}` });

  await interaction.editReply({ embeds: [embed] });
}
