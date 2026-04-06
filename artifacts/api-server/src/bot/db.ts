import { db, warningsTable, notesTable, tempBansTable, guildConfigTable, wordFilterTable, commandPermsTable, casesTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
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

export async function removeWarning(id: number, guildId: string): Promise<boolean> {
  const rows = await db.select().from(warningsTable).where(
    and(eq(warningsTable.id, id), eq(warningsTable.guildId, guildId))
  );
  if (rows.length === 0) return false;
  await db.delete(warningsTable).where(eq(warningsTable.id, id));
  return true;
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

// ─── Word filter ──────────────────────────────────────────────────────────────
const wordFilterCache = new Map<string, string[]>();

export async function addBannedWord(guildId: string, word: string, addedBy: string): Promise<boolean> {
  const existing = await getWordFilter(guildId);
  if (existing.includes(word.toLowerCase())) return false;
  await db.insert(wordFilterTable).values({ guildId, word: word.toLowerCase(), addedBy });
  wordFilterCache.delete(guildId);
  return true;
}

export async function removeBannedWord(guildId: string, word: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(wordFilterTable)
    .where(and(eq(wordFilterTable.guildId, guildId), eq(wordFilterTable.word, word.toLowerCase())));
  if (rows.length === 0) return false;
  await db
    .delete(wordFilterTable)
    .where(and(eq(wordFilterTable.guildId, guildId), eq(wordFilterTable.word, word.toLowerCase())));
  wordFilterCache.delete(guildId);
  return true;
}

export async function getWordFilter(guildId: string): Promise<string[]> {
  if (wordFilterCache.has(guildId)) return wordFilterCache.get(guildId)!;
  const rows = await db.select().from(wordFilterTable).where(eq(wordFilterTable.guildId, guildId));
  const words = rows.map((r) => r.word);
  wordFilterCache.set(guildId, words);
  return words;
}

export async function clearWordFilter(guildId: string): Promise<void> {
  await db.delete(wordFilterTable).where(eq(wordFilterTable.guildId, guildId));
  wordFilterCache.delete(guildId);
}

// ─── Cases ────────────────────────────────────────────────────────────────────
export async function logCase(
  guildId: string,
  actionType: string,
  targetId: string,
  targetTag: string,
  moderatorId: string,
  moderatorTag: string,
  reason: string,
  extra = ""
): Promise<number> {
  const rows = await db
    .insert(casesTable)
    .values({ guildId, actionType, targetId, targetTag, moderatorId, moderatorTag, reason, extra })
    .returning({ id: casesTable.id });
  return rows[0]!.id;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getServerStats(guildId: string) {
  const [warnings, automod, cases, tempbans, notes, words] = await Promise.all([
    db.select({ c: count() }).from(warningsTable).where(eq(warningsTable.guildId, guildId)),
    db.select({ c: count() }).from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.moderatorTag, "GL1TCH"))),
    db.select({ c: count() }).from(casesTable).where(eq(casesTable.guildId, guildId)),
    db.select({ c: count() }).from(tempBansTable).where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.unbanned, false))),
    db.select({ c: count() }).from(notesTable).where(eq(notesTable.guildId, guildId)),
    db.select({ c: count() }).from(wordFilterTable).where(eq(wordFilterTable.guildId, guildId)),
  ]);
  return {
    totalWarnings:     Number(warnings[0]?.c ?? 0),
    automodIntercepts: Number(automod[0]?.c ?? 0),
    totalCases:        Number(cases[0]?.c ?? 0),
    activeTempBans:    Number(tempbans[0]?.c ?? 0),
    totalNotes:        Number(notes[0]?.c ?? 0),
    bannedWords:       Number(words[0]?.c ?? 0),
  };
}

// ─── Command permissions ──────────────────────────────────────────────────────
const cmdPermsCache = new Map<string, Map<string, string[]>>();

function cmdCacheKey(guildId: string) { return guildId; }

export async function getCommandRoles(guildId: string, commandName: string): Promise<string[]> {
  const cached = cmdPermsCache.get(cmdCacheKey(guildId));
  if (cached) return cached.get(commandName) ?? [];

  const rows = await db.select().from(commandPermsTable).where(eq(commandPermsTable.guildId, guildId));
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!map.has(row.commandName)) map.set(row.commandName, []);
    map.get(row.commandName)!.push(row.roleId);
  }
  cmdPermsCache.set(guildId, map);
  return map.get(commandName) ?? [];
}

export async function addCommandRole(guildId: string, commandName: string, roleId: string, addedBy: string): Promise<boolean> {
  const existing = await getCommandRoles(guildId, commandName);
  if (existing.includes(roleId)) return false;
  await db.insert(commandPermsTable).values({ guildId, commandName, roleId, addedBy });
  cmdPermsCache.delete(guildId);
  return true;
}

export async function removeCommandRole(guildId: string, commandName: string, roleId: string): Promise<boolean> {
  const existing = await getCommandRoles(guildId, commandName);
  if (!existing.includes(roleId)) return false;
  await db.delete(commandPermsTable).where(
    and(
      eq(commandPermsTable.guildId, guildId),
      eq(commandPermsTable.commandName, commandName),
      eq(commandPermsTable.roleId, roleId),
    )
  );
  cmdPermsCache.delete(guildId);
  return true;
}

export async function clearCommandRoles(guildId: string, commandName: string): Promise<void> {
  await db.delete(commandPermsTable).where(
    and(eq(commandPermsTable.guildId, guildId), eq(commandPermsTable.commandName, commandName))
  );
  cmdPermsCache.delete(guildId);
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
    maxEmojis: 15,
    linkFilterEnabled: false,
    maxNewlines: 8,
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
