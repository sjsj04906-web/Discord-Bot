import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const commandPermsTable = pgTable("command_perms", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  commandName: text("command_name").notNull(),
  roleId:      text("role_id").notNull(),
  addedBy:     text("added_by").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type CommandPerm = typeof commandPermsTable.$inferSelect;
