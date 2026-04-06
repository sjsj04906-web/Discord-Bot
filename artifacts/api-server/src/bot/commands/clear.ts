import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Delete a number of messages from the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of messages to delete (1-100)")
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  )
  .addUserOption((option) =>
    option.setName("user").setDescription("Only delete messages from this user").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const filterUser = interaction.options.getUser("user");
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({ content: "Could not find the channel.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    let messages = await channel.messages.fetch({ limit: 100 });

    if (filterUser) {
      messages = messages.filter((m) => m.author.id === filterUser.id);
    }

    const toDelete = [...messages.values()].slice(0, amount);

    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);

    if (deletable.length === 0) {
      await interaction.editReply("No messages found to delete (messages older than 14 days cannot be bulk-deleted).");
      return;
    }

    const deleted = await channel.bulkDelete(deletable, true);
    await interaction.editReply(`✅ Deleted **${deleted.size}** message(s).`);
  } catch (err) {
    await interaction.editReply(`Failed to delete messages: ${String(err)}`);
  }
}
