import { db, warningsTable, notesTable, tempBansTable, guildConfigTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { GuildConfig } from "@workspace/db";

// ─── Warnings ─────────────────────────────────────────────────────────────────
export async function addWarning(guildId: string, userId: string, reason: string, moderatorTag: string) {
  await db.insert(warningsTable).values({ guildId, userId, reason, moderatorTag });
}

export async function getWarnings(guildId: string, userId: string) {
  return db
    .select()
    .from(warningsTable)
    .where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)))
    .orderBy(desc(warningsTable.createdAt));
}

export async function countWarnings(guildId: string, userId: string): Promise<number> {
  const rows = await getWarnings(guildId, userId);
  return rows.length;
}

export async function clearWarnings(guildId: string, userId: string) {
  await db.delete(warningsTable).where(
    and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId))
  );
}

// ─── Notes ────────────────────────────────────────────────────────────────────
export async function addNote(guildId: string, userId: string, note: string, moderatorTag: string) {
  await db.insert(notesTable).values({ guildId, userId, note, moderatorTag });
}

export async function getNotes(guildId: string, userId: string) {
  return db
    .select()
    .from(notesTable)
    .where(and(eq(notesTable.guildId, guildId), eq(notesTable.userId, userId)))
    .orderBy(desc(notesTable.createdAt));
}

export async function clearNotes(guildId: string, userId: string) {
  await db.delete(notesTable).where(
    and(eq(notesTable.guildId, guildId), eq(notesTable.userId, userId))
  );
}

// ─── Temp bans ────────────────────────────────────────────────────────────────
export async function addTempBan(guildId: string, userId: string, userTag: string, reason: string, unbanAt: Date): Promise<number> {
  const rows = await db.insert(tempBansTable).values({ guildId, userId, userTag, reason, unbanAt }).returning({ id: tempBansTable.id });
  return rows[0]!.id;
}

export async function getPendingTempBans() {
  return db
    .select()
    .from(tempBansTable)
    .where(eq(tempBansTable.unbanned, false));
}

export async function markTempBanUnbanned(id: number) {
  await db.update(tempBansTable).set({ unbanned: true }).where(eq(tempBansTable.id, id));
}

// ─── Guild config ─────────────────────────────────────────────────────────────
const configCache = new Map<string, GuildConfig>();

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  if (configCache.has(guildId)) return configCache.get(guildId)!;

  const rows = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId));

  if (rows.length > 0) {
    configCache.set(guildId, rows[0]!);
    return rows[0]!;
  }

  const defaults: GuildConfig = {
    guildId,
    spamThreshold: 5,
    capsThreshold: 75,
    maxMentions: 4,
    newAccountDays: 7,
    exemptChannels: "",
    autoEscalation: true,
    messageLogEnabled: true,
    antiRaidEnabled: true,
    antiRaidThreshold: 10,
    antiRaidWindowSecs: 30,
  };

  await db.insert(guildConfigTable).values(defaults).onConflictDoNothing();
  configCache.set(guildId, defaults);
  return defaults;
}

export async function updateGuildConfig(guildId: string, updates: Partial<Omit<GuildConfig, "guildId">>) {
  await getGuildConfig(guildId);
  await db
    .insert(guildConfigTable)
    .values({ guildId, ...updates })
    .onConflictDoUpdate({ target: guildConfigTable.guildId, set: updates });
  configCache.delete(guildId);
}

export function getExemptChannelIds(config: GuildConfig): string[] {
  return config.exemptChannels ? config.exemptChannels.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
