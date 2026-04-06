import { db, warningsTable, notesTable, tempBansTable, guildConfigTable, wordFilterTable, commandPermsTable, casesTable, ticketsTable, tempRolesTable, reactionRolesTable, roleBackupsTable, modMailSessionsTable, remindersTable, xpTable, levelRolesTable } from "@workspace/db";
import { eq, and, desc, count, sql, inArray, lt, gt, lte, asc } from "drizzle-orm";
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

export async function removeWarningsByIds(ids: number[], guildId: string): Promise<number> {
  if (ids.length === 0) return 0;
  await db.delete(warningsTable).where(
    and(eq(warningsTable.guildId, guildId), inArray(warningsTable.id, ids))
  );
  return ids.length;
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

export async function removeNote(id: number, guildId: string): Promise<boolean> {
  const rows = await db.select().from(notesTable).where(
    and(eq(notesTable.id, id), eq(notesTable.guildId, guildId))
  );
  if (rows.length === 0) return false;
  await db.delete(notesTable).where(eq(notesTable.id, id));
  return true;
}

export async function getAllWarnings(guildId: string) {
  return db.select().from(warningsTable).where(eq(warningsTable.guildId, guildId)).orderBy(desc(warningsTable.createdAt));
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

export async function getCase(id: number, guildId: string) {
  const rows = await db.select().from(casesTable).where(and(eq(casesTable.id, id), eq(casesTable.guildId, guildId)));
  return rows[0] ?? null;
}

export async function updateCaseReason(id: number, guildId: string, reason: string) {
  await db.update(casesTable).set({ reason }).where(and(eq(casesTable.id, id), eq(casesTable.guildId, guildId)));
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
    messageLogChannelId: "",
    antiRaidEnabled: true,
    antiRaidThreshold: 10,
    antiRaidWindowSecs: 30,
    maxEmojis: 15,
    linkFilterEnabled: false,
    maxNewlines: 8,
    welcomeChannelId: "",
    welcomeMessage: "",
    autoRoleIds: "",
    warnExpiryDays: 0,
    modMailChannelId: "",
    modLogChannelId: "",
    adminLogChannelId: "",
    adminLogEnabled: true,
    verifyRoleId: "",
    memberCountChannelId: "",
    humanCountChannelId: "",
    levelingEnabled: true,
    levelUpChannelId: "",
    voiceLogChannelId: "",
    joinLogChannelId: "",
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

export async function setWelcomeConfig(guildId: string, updates: { welcomeChannelId?: string; welcomeMessage?: string }) {
  await updateGuildConfig(guildId, updates);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────
export async function openTicket(guildId: string, channelId: string, userId: string, userTag: string, subject: string) {
  await db.insert(ticketsTable).values({ guildId, channelId, userId, userTag, subject, status: "open" });
}

export async function closeTicket(id: number) {
  await db.update(ticketsTable).set({ status: "closed" }).where(eq(ticketsTable.id, id));
}

export async function getTicketByChannel(channelId: string) {
  const rows = await db.select().from(ticketsTable).where(and(eq(ticketsTable.channelId, channelId), eq(ticketsTable.status, "open")));
  return rows[0] ?? null;
}

// ─── Temp roles ───────────────────────────────────────────────────────────────
export async function addTempRole(
  guildId: string, userId: string, userTag: string,
  roleId: string, roleName: string, expiresAt: Date
) {
  const rows = await db
    .insert(tempRolesTable)
    .values({ guildId, userId, userTag, roleId, roleName, expiresAt })
    .returning();
  return rows[0]!;
}

export async function getPendingTempRoles() {
  return db.select().from(tempRolesTable).where(eq(tempRolesTable.removed, false));
}

export async function markTempRoleRemoved(id: number) {
  await db.update(tempRolesTable).set({ removed: true }).where(eq(tempRolesTable.id, id));
}

// ─── Reaction roles ───────────────────────────────────────────────────────────
export async function addReactionRole(
  guildId: string, messageId: string, channelId: string,
  emoji: string, roleId: string, roleName: string
) {
  await db.insert(reactionRolesTable).values({ guildId, messageId, channelId, emoji, roleId, roleName })
    .onConflictDoNothing();
}

export async function removeReactionRole(guildId: string, messageId: string, emoji: string): Promise<boolean> {
  const rows = await db.select().from(reactionRolesTable).where(
    and(eq(reactionRolesTable.guildId, guildId), eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emoji, emoji))
  );
  if (rows.length === 0) return false;
  await db.delete(reactionRolesTable).where(
    and(eq(reactionRolesTable.guildId, guildId), eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emoji, emoji))
  );
  return true;
}

export async function getReactionRoles(guildId: string) {
  return db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, guildId));
}

export async function getReactionRole(guildId: string, messageId: string, emoji: string) {
  const rows = await db.select().from(reactionRolesTable).where(
    and(eq(reactionRolesTable.guildId, guildId), eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emoji, emoji))
  );
  return rows[0] ?? null;
}

// ─── Role backups ─────────────────────────────────────────────────────────────
export async function saveRoleBackup(guildId: string, userId: string, roleIds: string[]): Promise<void> {
  const roleStr = roleIds.join(",");
  const existing = await db.select().from(roleBackupsTable).where(
    and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId))
  );
  if (existing.length > 0) {
    await db.update(roleBackupsTable).set({ roleIds: roleStr, updatedAt: new Date() }).where(
      and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId))
    );
  } else {
    await db.insert(roleBackupsTable).values({ guildId, userId, roleIds: roleStr });
  }
}

export async function getRoleBackup(guildId: string, userId: string): Promise<string[]> {
  const rows = await db.select().from(roleBackupsTable).where(
    and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId))
  );
  if (!rows[0]?.roleIds) return [];
  return rows[0].roleIds.split(",").filter(Boolean);
}

export async function deleteRoleBackup(guildId: string, userId: string): Promise<void> {
  await db.delete(roleBackupsTable).where(
    and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId))
  );
}

// ─── Mod mail sessions ────────────────────────────────────────────────────────
export async function openModMailSession(guildId: string, userId: string, userTag: string, channelId: string): Promise<void> {
  await db.insert(modMailSessionsTable).values({ guildId, userId, userTag, channelId, status: "open" });
}

export async function closeModMailSession(id: number): Promise<void> {
  await db.update(modMailSessionsTable).set({ status: "closed" }).where(eq(modMailSessionsTable.id, id));
}

export async function getModMailSessionByUser(guildId: string, userId: string) {
  const rows = await db.select().from(modMailSessionsTable).where(
    and(eq(modMailSessionsTable.guildId, guildId), eq(modMailSessionsTable.userId, userId), eq(modMailSessionsTable.status, "open"))
  );
  return rows[0] ?? null;
}

export async function getModMailSessionByChannel(channelId: string) {
  const rows = await db.select().from(modMailSessionsTable).where(eq(modMailSessionsTable.channelId, channelId));
  return rows[0] ?? null;
}

// ─── Warn expiry ──────────────────────────────────────────────────────────────
export async function getGuildsWithWarnExpiry(): Promise<{ guildId: string; warnExpiryDays: number }[]> {
  const rows = await db.select({
    guildId: guildConfigTable.guildId,
    warnExpiryDays: guildConfigTable.warnExpiryDays,
  }).from(guildConfigTable).where(gt(guildConfigTable.warnExpiryDays, 0));
  return rows;
}

export async function deleteExpiredWarnings(guildId: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select({ id: warningsTable.id }).from(warningsTable).where(
    and(eq(warningsTable.guildId, guildId), lt(warningsTable.createdAt, cutoff))
  );
  if (rows.length === 0) return 0;
  await db.delete(warningsTable).where(
    and(eq(warningsTable.guildId, guildId), lt(warningsTable.createdAt, cutoff))
  );
  return rows.length;
}

// ─── GDPR: user data retrieval ────────────────────────────────────────────────
export async function getUserData(guildId: string, userId: string) {
  const [warnings, notes, cases, tempBans, modmail, roleBackup, tickets] = await Promise.all([
    db.select().from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId))).orderBy(desc(warningsTable.createdAt)),
    db.select().from(notesTable).where(and(eq(notesTable.guildId, guildId), eq(notesTable.userId, userId))).orderBy(desc(notesTable.createdAt)),
    db.select().from(casesTable).where(and(eq(casesTable.guildId, guildId), eq(casesTable.targetId, userId))).orderBy(desc(casesTable.createdAt)),
    db.select().from(tempBansTable).where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.userId, userId))).orderBy(desc(tempBansTable.createdAt)),
    db.select().from(modMailSessionsTable).where(and(eq(modMailSessionsTable.guildId, guildId), eq(modMailSessionsTable.userId, userId))).orderBy(desc(modMailSessionsTable.createdAt)),
    db.select().from(roleBackupsTable).where(and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId))),
    db.select().from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId))).orderBy(desc(ticketsTable.createdAt)),
  ]);
  return { warnings, notes, cases, tempBans, modmail, roleBackup, tickets };
}

// ─── GDPR: user data erasure ──────────────────────────────────────────────────
export async function eraseUserData(guildId: string, userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const warn = await db.select({ id: warningsTable.id }).from(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)));
  counts.warnings = warn.length;
  if (warn.length) await db.delete(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)));

  const note = await db.select({ id: notesTable.id }).from(notesTable).where(and(eq(notesTable.guildId, guildId), eq(notesTable.userId, userId)));
  counts.notes = note.length;
  if (note.length) await db.delete(notesTable).where(and(eq(notesTable.guildId, guildId), eq(notesTable.userId, userId)));

  const cas = await db.select({ id: casesTable.id }).from(casesTable).where(and(eq(casesTable.guildId, guildId), eq(casesTable.targetId, userId)));
  counts.cases = cas.length;
  if (cas.length) await db.delete(casesTable).where(and(eq(casesTable.guildId, guildId), eq(casesTable.targetId, userId)));

  const tb = await db.select({ id: tempBansTable.id }).from(tempBansTable).where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.userId, userId)));
  counts.tempBans = tb.length;
  if (tb.length) await db.delete(tempBansTable).where(and(eq(tempBansTable.guildId, guildId), eq(tempBansTable.userId, userId)));

  const mm = await db.select({ id: modMailSessionsTable.id }).from(modMailSessionsTable).where(and(eq(modMailSessionsTable.guildId, guildId), eq(modMailSessionsTable.userId, userId)));
  counts.modmail = mm.length;
  if (mm.length) await db.delete(modMailSessionsTable).where(and(eq(modMailSessionsTable.guildId, guildId), eq(modMailSessionsTable.userId, userId)));

  const rb = await db.select({ id: roleBackupsTable.id }).from(roleBackupsTable).where(and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId)));
  counts.roleBackups = rb.length;
  if (rb.length) await db.delete(roleBackupsTable).where(and(eq(roleBackupsTable.guildId, guildId), eq(roleBackupsTable.userId, userId)));

  const tk = await db.select({ id: ticketsTable.id }).from(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId)));
  counts.tickets = tk.length;
  if (tk.length) await db.delete(ticketsTable).where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId)));

  return counts;
}

// ─── GDPR: retention purge ────────────────────────────────────────────────────
export async function purgeOldRecords(guildId: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  let total = 0;

  const tables = [
    { tbl: warningsTable,       col: warningsTable.createdAt,       gid: warningsTable.guildId },
    { tbl: notesTable,          col: notesTable.createdAt,          gid: notesTable.guildId },
    { tbl: casesTable,          col: casesTable.createdAt,          gid: casesTable.guildId },
    { tbl: tempBansTable,       col: tempBansTable.createdAt,       gid: tempBansTable.guildId },
    { tbl: modMailSessionsTable,col: modMailSessionsTable.createdAt, gid: modMailSessionsTable.guildId },
    { tbl: ticketsTable,        col: ticketsTable.createdAt,        gid: ticketsTable.guildId },
  ] as const;

  for (const { tbl, col, gid } of tables) {
    const rows = await (db as any).select({ id: (tbl as any).id }).from(tbl).where(and(eq(gid as any, guildId), lt(col as any, cutoff)));
    if (rows.length) {
      await (db as any).delete(tbl).where(and(eq(gid as any, guildId), lt(col as any, cutoff)));
      total += rows.length;
    }
  }

  return total;
}

export const setGuildConfig = updateGuildConfig;

// ─── Mod Stats ────────────────────────────────────────────────────────────────
export async function getModStats(guildId: string) {
  const rows = await db
    .select({
      moderatorId:  casesTable.moderatorId,
      moderatorTag: casesTable.moderatorTag,
      total:        count(casesTable.id),
      bans:         sql<number>`COUNT(*) FILTER (WHERE ${casesTable.actionType} ILIKE '%ban%')`,
      kicks:        sql<number>`COUNT(*) FILTER (WHERE ${casesTable.actionType} ILIKE '%kick%')`,
      mutes:        sql<number>`COUNT(*) FILTER (WHERE ${casesTable.actionType} ILIKE '%mute%')`,
      warns:        sql<number>`COUNT(*) FILTER (WHERE ${casesTable.actionType} ILIKE '%warn%')`,
    })
    .from(casesTable)
    .where(eq(casesTable.guildId, guildId))
    .groupBy(casesTable.moderatorId, casesTable.moderatorTag)
    .orderBy(desc(count(casesTable.id)));
  return rows;
}

// ─── Reminders ────────────────────────────────────────────────────────────────
export async function addReminder(r: {
  userId: string; channelId: string; guildId: string; reminder: string; remindAt: Date;
}): Promise<number> {
  const [row] = await db.insert(remindersTable).values(r).returning({ id: remindersTable.id });
  return row!.id;
}

export async function getUserReminders(userId: string) {
  return db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.userId, userId), eq(remindersTable.sent, false)))
    .orderBy(remindersTable.remindAt);
}

export async function deleteReminder(id: number, userId: string): Promise<boolean> {
  const rows = await db.select().from(remindersTable).where(
    and(eq(remindersTable.id, id), eq(remindersTable.userId, userId))
  );
  if (rows.length === 0) return false;
  await db.delete(remindersTable).where(eq(remindersTable.id, id));
  return true;
}

export async function getPendingReminders() {
  return db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.sent, false), lte(remindersTable.remindAt, new Date())));
}

export async function markReminderSent(id: number) {
  await db.update(remindersTable).set({ sent: true }).where(eq(remindersTable.id, id));
}

// ─── XP / Leveling ────────────────────────────────────────────────────────────
export async function getOrCreateXp(guildId: string, userId: string) {
  const existing = await db.select().from(xpTable)
    .where(and(eq(xpTable.guildId, guildId), eq(xpTable.userId, userId)))
    .limit(1);
  if (existing.length > 0) return existing[0]!;

  const [row] = await db.insert(xpTable)
    .values({ guildId, userId, xp: 0, level: 0, messageCount: 0 })
    .onConflictDoNothing()
    .returning();
  return row ?? { guildId, userId, xp: 0, level: 0, messageCount: 0, id: 0, lastMessage: null, createdAt: new Date() };
}

export async function addXp(
  guildId: string,
  userId: string,
  amount: number
): Promise<{ oldLevel: number; newLevel: number; newXp: number }> {
  const record = await getOrCreateXp(guildId, userId);
  const oldLevel = record.level;
  const newXp = record.xp + amount;

  const { levelFromXp } = await import("./utils/xpMath.js");
  const newLevel = levelFromXp(newXp);

  await db.update(xpTable)
    .set({ xp: newXp, level: newLevel, messageCount: record.messageCount + 1, lastMessage: new Date() })
    .where(and(eq(xpTable.guildId, guildId), eq(xpTable.userId, userId)));

  return { oldLevel, newLevel, newXp };
}

export async function setUserXp(guildId: string, userId: string, amount: number) {
  const { levelFromXp } = await import("./utils/xpMath.js");
  const newLevel = levelFromXp(amount);
  await db.insert(xpTable)
    .values({ guildId, userId, xp: amount, level: newLevel, messageCount: 0 })
    .onConflictDoUpdate({
      target: [xpTable.guildId, xpTable.userId],
      set: { xp: amount, level: newLevel },
    });
}

export async function resetUserXp(guildId: string, userId: string) {
  await db.update(xpTable)
    .set({ xp: 0, level: 0, messageCount: 0 })
    .where(and(eq(xpTable.guildId, guildId), eq(xpTable.userId, userId)));
}

export async function getGuildRank(guildId: string, userId: string): Promise<number> {
  const result = await db
    .select({ userId: xpTable.userId, xp: xpTable.xp })
    .from(xpTable)
    .where(eq(xpTable.guildId, guildId))
    .orderBy(desc(xpTable.xp));
  const idx = result.findIndex((r) => r.userId === userId);
  return idx === -1 ? result.length + 1 : idx + 1;
}

export async function getLeaderboard(guildId: string, limit = 10, offset = 0) {
  return db.select()
    .from(xpTable)
    .where(eq(xpTable.guildId, guildId))
    .orderBy(desc(xpTable.xp))
    .limit(limit)
    .offset(offset);
}

export async function getLevelRoles(guildId: string) {
  return db.select().from(levelRolesTable)
    .where(eq(levelRolesTable.guildId, guildId))
    .orderBy(asc(levelRolesTable.level));
}

export async function saveLevelRole(guildId: string, level: number, roleId: string, roleName: string) {
  await db.insert(levelRolesTable)
    .values({ guildId, level, roleId, roleName })
    .onConflictDoUpdate({
      target: [levelRolesTable.guildId, levelRolesTable.level],
      set: { roleId, roleName },
    });
}

// ─── GDPR: all guilds with retention configured ───────────────────────────────
export async function getGuildsWithRetention(): Promise<{ guildId: string; dataRetentionDays: number }[]> {
  return db.select({
    guildId: guildConfigTable.guildId,
    dataRetentionDays: guildConfigTable.dataRetentionDays,
  }).from(guildConfigTable).where(gt(guildConfigTable.dataRetentionDays, 0));
}
