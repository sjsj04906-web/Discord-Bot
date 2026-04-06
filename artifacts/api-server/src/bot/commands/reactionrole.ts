import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { addReactionRole, removeReactionRole, getReactionRoles } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("reactionrole")
  .setDescription("Assign roles to members when they react to a message")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Link an emoji on a message to a role")
      .addStringOption((o) =>
        o.setName("message_id").setDescription("ID of the message to watch").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("emoji").setDescription("Emoji (e.g. 👍 or :customemoji:)").setRequired(true)
      )
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to assign").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a reaction role binding")
      .addStringOption((o) =>
        o.setName("message_id").setDescription("Message ID").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("emoji").setDescription("Emoji to unbind").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("List all reaction roles configured in this server")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const messageId = interaction.options.getString("message_id", true);
    const emoji     = interaction.options.getString("emoji", true).trim();
    const role      = interaction.options.getRole("role", true);

    // Verify the message exists in this guild
    const message = await interaction.channel?.messages.fetch(messageId).catch(() => null);
    if (!message) {
      await interaction.reply({
        content: "Message not found in this channel. Make sure you're running this command in the same channel as the message.",
        ephemeral: true,
      });
      return;
    }

    // Add the reaction to the message so users know what to click
    await message.react(emoji).catch(() => {});

    await addReactionRole(interaction.guild.id, messageId, interaction.channelId, emoji, role.id, role.name);

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // REACTION ROLE ADDED")
      .addFields(
        { name: "MESSAGE",  value: `[Jump](${message.url})`, inline: true },
        { name: "EMOJI",    value: emoji, inline: true },
        { name: "ROLE",     value: `${role}`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "remove") {
    const messageId = interaction.options.getString("message_id", true);
    const emoji     = interaction.options.getString("emoji", true).trim();

    const deleted = await removeReactionRole(interaction.guild.id, messageId, emoji);
    if (!deleted) {
      await interaction.reply({ content: "No reaction role found for that message + emoji combination.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: `✅ Removed reaction role binding for **${emoji}** on message \`${messageId}\`.`, ephemeral: true });
    return;
  }

  if (sub === "list") {
    const rrs = await getReactionRoles(interaction.guild.id);

    if (rrs.length === 0) {
      await interaction.reply({ content: "No reaction roles configured in this server.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🎭 // REACTION ROLES")
      .setDescription(`${rrs.length} binding(s) configured`)
      .setTimestamp();

    for (const rr of rrs.slice(0, 20)) {
      embed.addFields({
        name: `${rr.emoji} → @${rr.roleName}`,
        value: `Message \`${rr.messageId}\` in <#${rr.channelId}>`,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
