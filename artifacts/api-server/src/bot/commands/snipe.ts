import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getSnipe } from "../utils/snipeStore.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("snipe")
  .setDescription("Show the last deleted message in this channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const snipe = getSnipe(interaction.channelId);

  if (!snipe) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.muted)
          .setDescription("No deleted messages cached for this channel yet."),
      ],
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setAuthor({ name: `🗑️  Sniped  ·  ${BOT_NAME}` })
    .setTitle(snipe.authorTag)
    .setThumbnail(snipe.authorAvatar)
    .setDescription(snipe.content || "_[no text content]_")
    .setFooter({ text: `Deleted` })
    .setTimestamp(snipe.deletedAt);

  if (snipe.imageUrl) {
    embed.setImage(snipe.imageUrl);
  }

  await interaction.reply({ embeds: [embed] });
}
