import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { addNote, getNotes, clearNotes } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("note")
  .setDescription("Add or view private moderator notes on a user")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Add a note to a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addStringOption((o) => o.setName("text").setDescription("The note content").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("View notes for a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("clear")
      .setDescription("Clear all notes for a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser("user", true);

  if (sub === "add") {
    const text = interaction.options.getString("text", true);
    await addNote(interaction.guild.id, target.id, text, interaction.user.tag);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("📝 // NOTE LOGGED")
      .addFields(
        { name: "TARGET",   value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        { name: "NOTE",     value: text },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "list") {
    const notes = await getNotes(interaction.guild.id, target.id);

    if (notes.length === 0) {
      await interaction.reply({ content: `No notes on record for ${target.tag}.`, ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`📋 // NOTES: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(`**${notes.length}** note(s) on record`)
      .setTimestamp();

    for (const [i, n] of notes.slice(-10).entries()) {
      embed.addFields({
        name: `#${i + 1}  •  ${n.createdAt.toLocaleDateString()}`,
        value: `${n.note}\n— \`${n.moderatorTag}\``,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "clear") {
    await clearNotes(interaction.guild.id, target.id);
    await interaction.reply({ content: `✅ Cleared all notes for **${target.tag}**.`, ephemeral: true });
  }
}
