import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { log } from "../display.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Bulk delete messages from the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Messages to delete (1–100)").setMinValue(1).setMaxValue(100).setRequired(true)
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Only delete messages from this user").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger("amount", true);
  const filterUser = interaction.options.getUser("user");
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({ content: "Channel not found.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    let messages = await channel.messages.fetch({ limit: 100 });

    if (filterUser) {
      messages = messages.filter((m) => m.author.id === filterUser.id);
    }

    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const toDelete = [...messages.values()]
      .filter((m) => m.createdTimestamp > twoWeeksAgo)
      .slice(0, amount);

    if (toDelete.length === 0) {
      await interaction.editReply("No purgeable transmissions found (messages older than 14 days cannot be bulk-deleted).");
      return;
    }

    const deleted = await channel.bulkDelete(toDelete, true);

    const embed = new EmbedBuilder()
      .setColor(THEME.clear)
      .setTitle("🗑️ // TRANSMISSIONS PURGED")
      .addFields(
        { name: "PURGED", value: `${deleted.size} message(s)`, inline: true },
        { name: "CHANNEL", value: `${channel}`, inline: true },
        filterUser
          ? { name: "FILTER", value: filterUser.tag, inline: true }
          : { name: "\u200b", value: "\u200b", inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    log.clear(channel.name, interaction.guild?.name ?? "Unknown", deleted.size);
  } catch (err) {
    await interaction.editReply(`Purge failed: ${String(err)}`);
  }
}
