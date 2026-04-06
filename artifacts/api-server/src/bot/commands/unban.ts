import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Unban a user from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption((option) =>
    option.setName("user_id").setDescription("The ID of the user to unban").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the unban").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.options.getString("user_id", true).trim();
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  try {
    await interaction.guild.members.unban(userId, `${reason} | Unbanned by ${interaction.user.tag}`);
    await interaction.reply({ content: `✅ User **${userId}** has been unbanned.\n**Reason:** ${reason}` });
  } catch {
    await interaction.reply({ content: `Could not find a ban for user ID \`${userId}\`, or I lack permission to unban them.`, ephemeral: true });
  }
}
