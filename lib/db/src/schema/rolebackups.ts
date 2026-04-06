import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const roleBackupsTable = pgTable("role_backups", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  userId:    text("user_id").notNull(),
  roleIds:   text("role_ids").default("").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RoleBackup = typeof roleBackupsTable.$inferSelect;
