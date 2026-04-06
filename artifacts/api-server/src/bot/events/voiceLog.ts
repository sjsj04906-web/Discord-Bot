import { type VoiceState, EmbedBuilder, type TextChannel } from "discord.js";
import { THEME } from "../theme.js";

const MOD_LOG_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

function getModLog(state: VoiceState): TextChannel | undefined {
  return state.guild.channels.cache.find(
    (c) => MOD_LOG_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;
}

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const joined  = !oldState.channelId && newState.channelId;
  const left    = oldState.channelId && !newState.channelId;
  const moved   = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;
  const muted   = !oldState.mute && newState.mute;
  const unmuted = oldState.mute && !newState.mute;
  const deafed  = !oldState.deaf && newState.deaf;
  const undeafed = oldState.deaf && !newState.deaf;

  if (!joined && !left && !moved && !muted && !unmuted && !deafed && !undeafed) return;

  const channel = getModLog(newState.channel ? newState : oldState);
  if (!channel) return;

  let title = "";
  let color = THEME.info;
  let description = "";

  if (joined) {
    title = "🔊 VOICE JOIN";
    color = THEME.success;
    description = `${member} joined <#${newState.channelId}>`;
  } else if (left) {
    title = "🔇 VOICE LEAVE";
    color = THEME.muted;
    description = `${member} left <#${oldState.channelId}>`;
  } else if (moved) {
    title = "🔀 VOICE MOVE";
    color = THEME.info;
    description = `${member} moved from <#${oldState.channelId}> → <#${newState.channelId}>`;
  } else if (muted) {
    title = "🔕 SERVER MUTED";
    color = THEME.warn;
    description = `${member} was server-muted in <#${newState.channelId}>`;
  } else if (unmuted) {
    title = "🔔 SERVER UNMUTED";
    color = THEME.success;
    description = `${member} was server-unmuted in <#${newState.channelId}>`;
  } else if (deafed) {
    title = "🙉 SERVER DEAFENED";
    color = THEME.warn;
    description = `${member} was server-deafened in <#${newState.channelId}>`;
  } else if (undeafed) {
    title = "👂 SERVER UNDEAFENED";
    color = THEME.success;
    description = `${member} was server-undeafened in <#${newState.channelId}>`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎙️ // ${title}`)
    .setDescription(description)
    .setFooter({ text: `User ID: ${member.user.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
