import type { Client } from "discord.js";
import { getPendingTempBans, markTempBanUnbanned } from "./db.js";
import { log } from "./display.js";

async function processTempBan(
  client: Client,
  id: number,
  guildId: string,
  userId: string,
  userTag: string,
  unbanAt: Date
): Promise<void> {
  const delay = unbanAt.getTime() - Date.now();

  const doUnban = async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.unban(userId, "Temp ban expired");
      await markTempBanUnbanned(id);
      log.unban(userTag, guild.name);
    } catch {
      await markTempBanUnbanned(id).catch(() => {});
    }
  };

  if (delay <= 0) {
    await doUnban();
  } else {
    setTimeout(() => { doUnban().catch(() => {}); }, delay);
  }
}

export async function restorePendingTempBans(client: Client): Promise<void> {
  const pending = await getPendingTempBans();
  for (const ban of pending) {
    processTempBan(client, ban.id, ban.guildId, ban.userId, ban.userTag, ban.unbanAt).catch(() => {});
  }
  if (pending.length > 0) {
    log.command("tempban-restore", `${pending.length} pending`, "scheduler");
  }
}

export { processTempBan };
