import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getCase, updateCaseReason } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("case")
  .setDescription("View or edit a mod case by its ID")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub.setName("view")
      .setDescription("View a specific case")
      .addIntegerOption((o) =>
        o.setName("id").setDescription("Case ID number").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("edit")
      .setDescription("Update the reason on a case")
      .addIntegerOption((o) =>
        o.setName("id").setDescription("Case ID number").setRequired(true).setMinValue(1)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("New reason text").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const id  = interaction.options.getInteger("id", true);

  const found = await getCase(id, interaction.guild.id);
  if (!found) {
    await interaction.reply({ content: `Case #${id} not found in this server.`, ephemeral: true });
    return;
  }

  if (sub === "view") {
    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`📋 // CASE #${found.id}`)
      .addFields(
        { name: "ACTION",    value: found.actionType, inline: true },
        { name: "TARGET",    value: `\`${found.targetTag}\` (${found.targetId})`, inline: true },
        { name: "OPERATOR",  value: `\`${found.moderatorTag}\``, inline: true },
        { name: "REASON",    value: found.reason },
        { name: "DATE",      value: `<t:${Math.floor(found.createdAt.getTime() / 1000)}:F>`, inline: true },
      )
      .setFooter({ text: `Case ID: ${found.id}` })
      .setTimestamp();

    if (found.extra) embed.addFields({ name: "EXTRA", value: found.extra, inline: true });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "edit") {
    const newReason = interaction.options.getString("reason", true);
    await updateCaseReason(id, interaction.guild.id, newReason);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle(`✅ // CASE #${id} UPDATED`)
      .addFields(
        { name: "CASE",       value: `#${id}`, inline: true },
        { name: "ACTION",     value: found.actionType, inline: true },
        { name: "TARGET",     value: `\`${found.targetTag}\``, inline: true },
        { name: "OLD REASON", value: found.reason },
        { name: "NEW REASON", value: newReason },
        { name: "EDITED BY",  value: `${interaction.user}`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
