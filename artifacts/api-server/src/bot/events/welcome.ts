import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const FALLBACK_NAMES = ["welcome", "welcomes", "welcome-mat", "arrivals", "greetings"];
const DEFAULT_MESSAGE = "Welcome to **{server}**, {user}! You are member **#{membercount}**.";

function interpolate(template: string, member: GuildMember): string {
  return template
    .replace(/{user}/gi,        member.toString())
    .replace(/{mention}/gi,     member.toString())
    .replace(/{username}/gi,    member.user.username)
    .replace(/{tag}/gi,         member.user.tag)
    .replace(/{userid}/gi,      member.user.id)
    .replace(/{server}/gi,      member.guild.name)
    .replace(/{membercount}/gi, String(member.guild.memberCount))
    .replace(/{avatar}/gi,      member.user.displayAvatarURL());
}

function accountAgeBadge(member: GuildMember): string {
  const createdAt   = member.user.createdTimestamp;
  const ageMs       = Date.now() - createdAt;
  const ageDays     = Math.floor(ageMs / 86_400_000);
  const relative    = `<t:${Math.floor(createdAt / 1000)}:R>`;
  const warning     = ageDays < 7 ? "  ⚠️ New account" : "";
  return `${relative}${warning}`;
}

async function getWelcomeChannel(member: GuildMember): Promise<TextChannel | null> {
  const config = await getGuildConfig(member.guild.id);

  if (config.welcomeChannelId) {
    const ch = member.guild.channels.cache.get(config.welcomeChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  // Fallback: find by name
  return (member.guild.channels.cache.find(
    (c) => FALLBACK_NAMES.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

export async function handleWelcome(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  const channel = await getWelcomeChannel(member);
  if (!channel) return;

  const messageTemplate = config.welcomeMessage || DEFAULT_MESSAGE;
  const description     = interpolate(messageTemplate, member);

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({
      name:    `${member.guild.name}`,
      iconURL: member.guild.iconURL() ?? undefined,
    })
    .setTitle("👋  New Member")
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name:   "Member",
        value:  `${member} \`${member.user.tag}\``,
        inline: true,
      },
      {
        name:   "Members",
        value:  `\`#${member.guild.memberCount}\``,
        inline: true,
      },
      {
        name:   "Account Created",
        value:  accountAgeBadge(member),
        inline: false,
      },
    )
    .setImage(member.user.bannerURL({ size: 512 }) ?? null)
    .setFooter({ text: `ID: ${member.user.id}  ·  ${BOT_NAME}` })
    .setTimestamp();

  await channel.send({ content: member.toString(), embeds: [embed] }).catch(() => {});
}
