import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const ticketsTable = pgTable("tickets", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  userId:    text("user_id").notNull(),
  userTag:   text("user_tag").notNull(),
  subject:   text("subject").default("No subject").notNull(),
  status:    text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Ticket = typeof ticketsTable.$inferSelect;
