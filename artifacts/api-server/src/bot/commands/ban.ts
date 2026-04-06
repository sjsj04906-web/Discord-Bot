import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to ban").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the ban").setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("delete_days")
      .setDescription("Number of days of messages to delete (0-7)")
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;

  const member = interaction.guild?.members.cache.get(target.id);

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  if (member && !member.bannable) {
    await interaction.reply({ content: "I cannot ban this user. They may have a higher role than me.", ephemeral: true });
    return;
  }

  try {
    await interaction.guild.members.ban(target, {
      reason: `${reason} | Banned by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86400,
    });
    await interaction.reply({
      content: `✅ **${target.tag}** has been banned.\n**Reason:** ${reason}`,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to ban user: ${String(err)}`, ephemeral: true });
  }
}
