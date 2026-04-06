import { getGuildsWithWarnExpiry, deleteExpiredWarnings } from "./db.js";
import { log } from "./display.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function runExpiry(): Promise<void> {
  const guilds = await getGuildsWithWarnExpiry();

  for (const { guildId, warnExpiryDays } of guilds) {
    const deleted = await deleteExpiredWarnings(guildId, warnExpiryDays);
    if (deleted > 0) {
      log.command("warn-expiry", `${deleted} expired warning(s) removed`, guildId);
    }
  }
}

export function startWarnExpiryScheduler(): void {
  runExpiry().catch(() => {});
  setInterval(() => { runExpiry().catch(() => {}); }, CHECK_INTERVAL_MS);
}
