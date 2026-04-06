import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { addNote, getNotes, clearNotes, removeNote } from "../db.js";
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
    sub.setName("remove")
      .setDescription("Remove a single note by its position number")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption((o) => o.setName("number").setDescription("Note number to remove (use /note list to see positions)").setRequired(true).setMinValue(1))
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

  const sub    = interaction.options.getSubcommand();
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

  if (sub === "remove") {
    const num   = interaction.options.getInteger("number", true);
    const notes = await getNotes(interaction.guild.id, target.id);

    if (notes.length === 0) {
      await interaction.reply({ content: `${target.tag} has no notes on record.`, ephemeral: true });
      return;
    }

    const note = notes[num - 1];
    if (!note) {
      await interaction.reply({
        content: `Note #${num} doesn't exist. ${target.tag} has **${notes.length}** note(s) — use \`/note list\` to see them.`,
        ephemeral: true,
      });
      return;
    }

    await removeNote(note.id, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // NOTE REMOVED")
      .addFields(
        { name: "TARGET",    value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
        { name: "REMOVED",   value: `Note #${num}`, inline: true },
        { name: "CONTENT",   value: note.note.slice(0, 500) },
        { name: "REMAINING", value: `${notes.length - 1} note(s)`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "clear") {
    const notes = await getNotes(interaction.guild.id, target.id);
    await clearNotes(interaction.guild.id, target.id);
    await interaction.reply({
      content: `✅ Cleared **${notes.length}** note(s) for **${target.tag}**.`,
      ephemeral: true,
    });
  }
}
