import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const reactionRolesTable = pgTable("reaction_roles", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  emoji:     text("emoji").notNull(),
  roleId:    text("role_id").notNull(),
  roleName:  text("role_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReactionRole = typeof reactionRolesTable.$inferSelect;
