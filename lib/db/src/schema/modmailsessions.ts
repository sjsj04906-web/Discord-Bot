import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const modMailSessionsTable = pgTable("modmail_sessions", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  userId:    text("user_id").notNull(),
  userTag:   text("user_tag").notNull(),
  channelId: text("channel_id").notNull(),
  status:    text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ModMailSession = typeof modMailSessionsTable.$inferSelect;
