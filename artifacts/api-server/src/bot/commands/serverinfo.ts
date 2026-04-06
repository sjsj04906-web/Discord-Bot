import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("View information about this server");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await guild.fetch();

  const owner = await guild.fetchOwner().catch(() => null);
  const textChannels  = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
  const categories    = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

  const verificationLabels = ["None", "Low", "Medium", "High", "Very High"];

  const boostLabel = guild.premiumSubscriptionCount
    ? `${guild.premiumSubscriptionCount} boosts  ·  Tier ${guild.premiumTier}`
    : "No boosts";

  const embed = new EmbedBuilder()
    .setColor(THEME.serverinfo)
    .setAuthor({ name: `Server Info  ·  ${BOT_NAME}` })
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .addFields(
      { name: "Server ID",    value: `\`${guild.id}\``, inline: true },
      { name: "Owner",        value: owner ? `\`${owner.user.tag}\`` : "Unknown", inline: true },
      { name: "Created",      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Members",      value: guild.memberCount.toLocaleString(), inline: true },
      { name: "Channels",     value: `💬 ${textChannels}  ·  🔊 ${voiceChannels}  ·  📁 ${categories}`, inline: true },
      { name: "Roles",        value: String(guild.roles.cache.size), inline: true },
      { name: "Verification", value: verificationLabels[guild.verificationLevel] ?? "Unknown", inline: true },
      { name: "Emojis",       value: String(guild.emojis.cache.size), inline: true },
      { name: "Boosts",       value: boostLabel, inline: true },
    )
    .setImage(guild.bannerURL({ size: 1024 }) ?? null)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
