import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const xpTable = pgTable("user_xp", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  userId:       text("user_id").notNull(),
  xp:           integer("xp").default(0).notNull(),
  level:        integer("level").default(0).notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  lastMessage:  timestamp("last_message"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId) }));

export const levelRolesTable = pgTable("level_roles", {
  id:       serial("id").primaryKey(),
  guildId:  text("guild_id").notNull(),
  level:    integer("level").notNull(),
  roleId:   text("role_id").notNull(),
  roleName: text("role_name").notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.level) }));

export type UserXp       = typeof xpTable.$inferSelect;
export type LevelRole    = typeof levelRolesTable.$inferSelect;
