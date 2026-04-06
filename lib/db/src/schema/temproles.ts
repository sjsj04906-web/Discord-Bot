import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const tempRolesTable = pgTable("temp_roles", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  userId:    text("user_id").notNull(),
  userTag:   text("user_tag").notNull(),
  roleId:    text("role_id").notNull(),
  roleName:  text("role_name").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  removed:   boolean("removed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TempRole = typeof tempRolesTable.$inferSelect;
