import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to kick").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the kick").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);

  if (!member) {
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }

  if (!member.kickable) {
    await interaction.reply({ content: "I cannot kick this user. They may have a higher role than me.", ephemeral: true });
    return;
  }

  try {
    await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);
    await interaction.reply({
      content: `✅ **${target.tag}** has been kicked.\n**Reason:** ${reason}`,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to kick user: ${String(err)}`, ephemeral: true });
  }
}
