import { type GuildMember, EmbedBuilder, type TextChannel, ChannelType } from "discord.js";
import { getGuildConfig } from "../db.js";
import { log } from "../display.js";
import { THEME } from "../theme.js";

const joinTracker = new Map<string, number[]>();

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

async function applySlowmode(guild: GuildMember["guild"]): Promise<number> {
  let count = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildText && channel.rateLimitPerUser === 0) {
      try {
        await channel.setRateLimitPerUser(10, "Anti-raid: slowmode applied");
        count++;
      } catch { /* no perms */ }
    }
  }
  return count;
}

async function alertChannel(guild: GuildMember["guild"], count: number, slowmodeCount: number): Promise<void> {
  const channel = guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setTitle("🚨 // RAID DETECTED — NETWORK LOCKDOWN")
    .setDescription(`**${count} entities** joined within the raid window.`)
    .addFields(
      { name: "VERIFICATION",  value: "Raised to HIGHEST", inline: true },
      { name: "SLOWMODE",      value: `Applied to ${slowmodeCount} channel(s)`, inline: true },
      { name: "RECOVERY",      value: "Use `/antiraid recover` to lift lockdown", inline: false },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleAntiRaid(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (!config.antiRaidEnabled) return;

  const now = Date.now();
  const windowMs = config.antiRaidWindowSecs * 1000;
  const guildId = member.guild.id;

  const times = (joinTracker.get(guildId) ?? []).filter((t) => now - t < windowMs);
  times.push(now);
  joinTracker.set(guildId, times);

  if (times.length >= config.antiRaidThreshold) {
    joinTracker.set(guildId, []);
    log.error(`RAID DETECTED in ${member.guild.name} — ${times.length} joins in ${config.antiRaidWindowSecs}s`);

    try { await member.guild.setVerificationLevel(4, "Anti-raid: mass join detected"); } catch { /* no perms */ }

    const slowmodeCount = await applySlowmode(member.guild);
    await alertChannel(member.guild, times.length, slowmodeCount);
  }
}
