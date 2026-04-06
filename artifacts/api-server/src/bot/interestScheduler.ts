import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { applyBankInterest } from "./db.js";
import { THEME, BOT_NAME } from "./theme.js";
import { logger } from "../lib/logger.js";

async function processInterest(client: Client): Promise<void> {
  const results = await applyBankInterest().catch((err) => {
    logger.error({ err }, "Bank interest error");
    return [];
  });

  for (const r of results) {
    try {
      const guild = await client.guilds.fetch(r.guildId).catch(() => null);
      if (!guild) continue;
      const member = await guild.members.fetch(r.userId).catch(() => null);
      if (!member) continue;

      const embed = new EmbedBuilder()
        .setColor(0x00BFFF)
        .setAuthor({ name: `🏦  Bank Interest  ·  ${BOT_NAME}` })
        .setDescription(`<@${r.userId}> earned **+${r.grant.toLocaleString()}** in daily bank interest (2%).`)
        .setTimestamp();

      await member.send({ embeds: [embed] }).catch(() => {});
    } catch {}
  }
}

export function startInterestScheduler(client: Client): void {
  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => processInterest(client), INTERVAL_MS);
  logger.info("Bank interest scheduler started (5-min interval)");
}
