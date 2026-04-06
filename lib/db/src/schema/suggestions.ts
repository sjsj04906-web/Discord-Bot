import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const suggestionsTable = pgTable("suggestions", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  userId:    text("user_id").notNull(),
  userTag:   text("user_tag").notNull(),
  content:   text("content").notNull(),
  status:    text("status").default("pending").notNull(),
  reason:    text("reason").default("").notNull(),
  staffId:   text("staff_id").default("").notNull(),
  staffTag:  text("staff_tag").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Suggestion = typeof suggestionsTable.$inferSelect;
