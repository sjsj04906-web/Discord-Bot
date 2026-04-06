import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";

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
  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

  const onlineCount = guild.members.cache.filter(
    (m) => m.presence?.status === "online" || m.presence?.status === "idle" || m.presence?.status === "dnd"
  ).size;

  const boostBar = "█".repeat(Math.min(guild.premiumSubscriptionCount ?? 0, 14));
  const boostLabel = guild.premiumSubscriptionCount
    ? `${boostBar} ${guild.premiumSubscriptionCount} boosts (Tier ${guild.premiumTier})`
    : "No boosts";

  const verificationLabels = ["None", "Low", "Medium", "High", "Very High"];

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .addFields(
      { name: "Server ID", value: `\`${guild.id}\``, inline: true },
      { name: "Owner", value: owner ? `${owner.user.tag}` : "Unknown", inline: true },
      { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Members", value: `👥 ${guild.memberCount.toLocaleString()} total`, inline: true },
      { name: "Channels", value: `💬 ${textChannels} text  🔊 ${voiceChannels} voice  📁 ${categories} categories`, inline: false },
      { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
      { name: "Emojis", value: `${guild.emojis.cache.size}`, inline: true },
      { name: "Verification", value: verificationLabels[guild.verificationLevel] ?? "Unknown", inline: true },
      { name: "Boosts", value: boostLabel },
    )
    .setImage(guild.bannerURL({ size: 1024 }) ?? null)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
