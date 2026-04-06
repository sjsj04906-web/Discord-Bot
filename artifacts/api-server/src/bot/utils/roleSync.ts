import type { Guild } from "discord.js";
import { getLevelRoles } from "../db.js";
import { levelFromXp } from "./xpMath.js";

/**
 * Find the highest level role a member qualifies for at a given level.
 * levelRoles must be sorted ascending by level (as returned by getLevelRoles).
 */
function qualifyingRole(
  levelRoles: Awaited<ReturnType<typeof getLevelRoles>>,
  atLevel: number
) {
  return [...levelRoles].filter((lr) => lr.level <= atLevel).at(-1) ?? null;
}

/**
 * Sync a guild member's level role to match their current XP.
 * Removes all stale level roles and grants the correct one.
 * Safe to call after setxp, resetxp, or any manual XP change.
 *
 * @returns the role name that was granted, or null if no change was needed
 */
export async function syncMemberLevelRole(
  guild: Guild,
  userId: string,
  currentXp: number
): Promise<string | null> {
  const levelRoles = await getLevelRoles(guild.id);
  if (levelRoles.length === 0) return null;

  const currentLevel = levelFromXp(currentXp);
  const targetRole   = qualifyingRole(levelRoles, currentLevel);

  const member = guild.members.cache.get(userId)
    ?? await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;

  // IDs of all level roles the member currently holds
  const heldLevelRoleIds = levelRoles
    .map((lr) => lr.roleId)
    .filter((id) => member.roles.cache.has(id));

  const alreadyCorrect =
    targetRole
      ? heldLevelRoleIds.length === 1 && heldLevelRoleIds[0] === targetRole.roleId
      : heldLevelRoleIds.length === 0;

  if (alreadyCorrect) return null;

  // Remove all stale level roles
  const toRemove = heldLevelRoleIds.filter((id) => id !== targetRole?.roleId);
  if (toRemove.length > 0) {
    await member.roles.remove(toRemove, "Level role sync").catch(() => {});
  }

  // Grant the correct role (if any)
  if (targetRole) {
    const discordRole =
      guild.roles.cache.get(targetRole.roleId) ??
      (await guild.roles.fetch(targetRole.roleId).catch(() => null));
    if (discordRole) {
      await member.roles.add(discordRole, `Level ${currentLevel} sync`).catch(() => {});
      return targetRole.roleName;
    }
  }

  return null;
}
