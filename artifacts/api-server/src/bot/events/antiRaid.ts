import { type GuildMember, EmbedBuilder, type TextChannel, PermissionFlagsBits } from "discord.js";
import { getGuildConfig } from "../db.js";
import { log } from "../display.js";
import { THEME } from "../theme.js";

const joinTracker = new Map<string, number[]>();

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

async function alertChannel(guild: GuildMember["guild"], count: number): Promise<void> {
  const channel = guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.danger)
    .setTitle("🚨 // RAID DETECTED — NETWORK LOCKDOWN")
    .setDescription(`**${count} entities** joined within the raid window. Server has been locked to high verification.`)
    .addFields({ name: "ACTION TAKEN", value: "Verification level raised to HIGHEST. Lower it manually when safe." })
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

    try {
      await member.guild.setVerificationLevel(4, "Anti-raid: mass join detected");
    } catch {
      // Missing permissions
    }

    await alertChannel(member.guild, times.length);
  }
}
