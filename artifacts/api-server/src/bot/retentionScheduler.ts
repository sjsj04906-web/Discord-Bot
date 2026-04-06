import { getGuildsWithRetention, purgeOldRecords } from "./db.js";
import { log } from "./display.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

async function runRetention(): Promise<void> {
  const guilds = await getGuildsWithRetention();

  for (const { guildId, dataRetentionDays } of guilds) {
    const deleted = await purgeOldRecords(guildId, dataRetentionDays);
    if (deleted > 0) {
      log.command("data-retention", `${deleted} record(s) purged (>${dataRetentionDays}d old)`, guildId);
    }
  }
}

export function startRetentionScheduler(): void {
  runRetention().catch(() => {});
  setInterval(() => { runRetention().catch(() => {}); }, CHECK_INTERVAL_MS);
}
