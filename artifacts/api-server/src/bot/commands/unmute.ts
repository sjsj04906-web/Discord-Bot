import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a timeout from a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to unmute").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);

  if (!member) {
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }

  if (!member.isCommunicationDisabled()) {
    await interaction.reply({ content: "That user is not currently muted.", ephemeral: true });
    return;
  }

  try {
    await member.timeout(null, `Unmuted by ${interaction.user.tag}`);
    await interaction.reply({
      content: `✅ **${target.tag}** has been unmuted.`,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to unmute user: ${String(err)}`, ephemeral: true });
  }
}
