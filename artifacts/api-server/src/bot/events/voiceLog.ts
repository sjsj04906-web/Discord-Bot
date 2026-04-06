import { type VoiceState, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const FALLBACK_NAMES = ["voice-log", "voicelog", "voice-activity", "admin-log", "adminlog"];

async function getVoiceLogChannel(guild: VoiceState["guild"]): Promise<TextChannel | null> {
  const config = await getGuildConfig(guild.id).catch(() => null);

  if (config?.voiceLogChannelId) {
    const ch = guild.channels.cache.get(config.voiceLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }
  if (config?.adminLogChannelId) {
    const ch = guild.channels.cache.get(config.adminLogChannelId);
    if (ch?.isTextBased()) return ch as TextChannel;
  }

  return (guild.channels.cache.find(
    (c) => FALLBACK_NAMES.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const guild = newState.guild;

  const joined   = !oldState.channelId && !!newState.channelId;
  const left     = !!oldState.channelId && !newState.channelId;
  const moved    = !!oldState.channelId && !!newState.channelId && oldState.channelId !== newState.channelId;
  const muted    = !oldState.serverMute && !!newState.serverMute;
  const unmuted  = !!oldState.serverMute && !newState.serverMute;
  const deafed   = !oldState.serverDeaf && !!newState.serverDeaf;
  const undeafed = !!oldState.serverDeaf && !newState.serverDeaf;

  if (!joined && !left && !moved && !muted && !unmuted && !deafed && !undeafed) return;

  const logCh = await getVoiceLogChannel(guild);
  if (!logCh) return;

  let color   = THEME.info;
  let title   = "";
  let details = "";

  if (joined) {
    color   = THEME.success;
    title   = "🔊  Joined Voice";
    details = `<#${newState.channelId}>`;
  } else if (left) {
    color   = THEME.danger;
    title   = "🔇  Left Voice";
    details = `<#${oldState.channelId}>`;
  } else if (moved) {
    color   = THEME.warn;
    title   = "↔️  Moved Voice Channel";
    details = `<#${oldState.channelId}> → <#${newState.channelId}>`;
  } else if (muted) {
    color   = THEME.warn;
    title   = "🔕  Server Muted";
    details = `in <#${newState.channelId}>`;
  } else if (unmuted) {
    color   = THEME.success;
    title   = "🔊  Server Unmuted";
    details = `in <#${newState.channelId}>`;
  } else if (deafed) {
    color   = THEME.warn;
    title   = "🔕  Server Deafened";
    details = `in <#${newState.channelId}>`;
  } else if (undeafed) {
    color   = THEME.success;
    title   = "🔔  Server Undeafened";
    details = `in <#${newState.channelId}>`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${title}  ·  ${BOT_NAME}` })
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "Member",  value: `${member} \`${member.user.tag}\``, inline: true },
      { name: "Channel", value: details, inline: true },
    )
    .setFooter({ text: `User ID: ${member.user.id}` })
    .setTimestamp();

  await logCh.send({ embeds: [embed] }).catch(() => {});
}
