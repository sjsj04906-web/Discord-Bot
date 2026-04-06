import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig } from "../db.js";
import { BOT_NAME } from "../theme.js";

function interpolate(template: string, member: GuildMember): string {
  return template
    .replace(/{user}/gi,        member.toString())
    .replace(/{username}/gi,    member.user.username)
    .replace(/{server}/gi,      member.guild.name)
    .replace(/{membercount}/gi, String(member.guild.memberCount))
    .replace(/{tag}/gi,         member.user.tag);
}

export async function handleWelcome(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (!config.welcomeChannelId || !config.welcomeMessage) return;

  const channel = member.guild.channels.cache.get(config.welcomeChannelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  const text = interpolate(config.welcomeMessage, member);

  const embed = new EmbedBuilder()
    .setColor(0x00ffe5)
    .setTitle(`👋 // WELCOME TO ${member.guild.name.toUpperCase()}`)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "MEMBER #", value: String(member.guild.memberCount), inline: true },
      { name: "ACCOUNT",  value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: BOT_NAME })
    .setTimestamp();

  await channel.send({ content: member.toString(), embeds: [embed] }).catch(() => {});
}
