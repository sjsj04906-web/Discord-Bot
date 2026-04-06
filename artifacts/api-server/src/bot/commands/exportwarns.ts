import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWarnings, getAllWarnings } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("exportwarns")
  .setDescription("Export warning records as a CSV file")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) =>
    o.setName("user").setDescription("Export warnings for one user (omit to export all server warnings)").setRequired(false)
  );

function buildCsv(rows: { id: number; userId: string; reason: string; moderatorTag: string; createdAt: Date }[]): string {
  const header = "ID,User ID,Reason,Moderator,Date\n";
  const lines = rows.map((w) =>
    [
      w.id,
      w.userId,
      `"${w.reason.replace(/"/g, '""')}"`,
      `"${w.moderatorTag.replace(/"/g, '""')}"`,
      w.createdAt.toISOString(),
    ].join(",")
  );
  return header + lines.join("\n");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const filterUser = interaction.options.getUser("user");
  const guildId    = interaction.guild.id;

  const warnings = filterUser
    ? await getWarnings(guildId, filterUser.id)
    : await getAllWarnings(guildId);

  if (warnings.length === 0) {
    await interaction.editReply("No warnings found to export.");
    return;
  }

  const csv        = buildCsv(warnings);
  const buffer     = Buffer.from(csv, "utf-8");
  const fileName   = filterUser
    ? `warns_${filterUser.id}_${Date.now()}.csv`
    : `warns_all_${guildId}_${Date.now()}.csv`;
  const attachment = new AttachmentBuilder(buffer, { name: fileName });

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setTitle("📤 // WARN EXPORT READY")
    .addFields(
      { name: "RECORDS",  value: String(warnings.length), inline: true },
      { name: "SCOPE",    value: filterUser ? filterUser.tag : "All server warnings", inline: true },
      { name: "FORMAT",   value: "CSV", inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}
