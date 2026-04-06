import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { THEME } from "../theme.js";

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

  const boostLabel = guild.premiumSubscriptionCount
    ? `${"█".repeat(Math.min(guild.premiumSubscriptionCount, 10))} ${guild.premiumSubscriptionCount} boosts (Tier ${guild.premiumTier})`
    : "No boosts";

  const verificationLabels = ["NONE", "LOW", "MEDIUM", "HIGH", "VERY HIGH"];

  const embed = new EmbedBuilder()
    .setColor(THEME.serverinfo)
    .setTitle(`◈ // NETWORK PROFILE: ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .addFields(
      { name: "SERVER ID", value: `\`${guild.id}\``, inline: true },
      { name: "ADMIN", value: owner ? `\`${owner.user.tag}\`` : "Unknown", inline: true },
      { name: "ONLINE SINCE", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "ENTITIES", value: `${guild.memberCount.toLocaleString()} members`, inline: true },
      { name: "CHANNELS", value: `💬 ${textChannels}  🔊 ${voiceChannels}  📁 ${categories}`, inline: true },
      { name: "ROLES", value: String(guild.roles.cache.size), inline: true },
      { name: "VERIFICATION", value: verificationLabels[guild.verificationLevel] ?? "Unknown", inline: true },
      { name: "EMOJIS", value: String(guild.emojis.cache.size), inline: true },
      { name: "BOOSTS", value: boostLabel },
    )
    .setImage(guild.bannerURL({ size: 1024 }) ?? null)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
