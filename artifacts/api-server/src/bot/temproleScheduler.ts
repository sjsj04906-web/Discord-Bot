import type { Client } from "discord.js";
import { getPendingTempRoles, markTempRoleRemoved } from "./db.js";
import { log } from "./display.js";

export async function processTempRole(
  client: Client,
  id: number,
  guildId: string,
  userId: string,
  userTag: string,
  roleId: string,
  roleName: string,
  expiresAt: Date
): Promise<void> {
  const delay = expiresAt.getTime() - Date.now();

  const doRemove = async () => {
    try {
      const guild  = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.roles.remove(roleId, "Temp role expired").catch(() => {});
      }
      await markTempRoleRemoved(id);
      log.command("temprole-expire", `${userTag} lost @${roleName}`, guild.name);
    } catch {
      await markTempRoleRemoved(id).catch(() => {});
    }
  };

  if (delay <= 0) {
    await doRemove();
  } else {
    setTimeout(() => { doRemove().catch(() => {}); }, delay);
  }
}

export async function restorePendingTempRoles(client: Client): Promise<void> {
  const pending = await getPendingTempRoles();
  for (const tr of pending) {
    processTempRole(client, tr.id, tr.guildId, tr.userId, tr.userTag, tr.roleId, tr.roleName, tr.expiresAt).catch(() => {});
  }
  if (pending.length > 0) {
    log.command("temprole-restore", `${pending.length} pending`, "scheduler");
  }
}
