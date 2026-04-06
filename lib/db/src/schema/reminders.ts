import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const remindersTable = pgTable("reminders", {
  id:        serial("id").primaryKey(),
  userId:    text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  guildId:   text("guild_id").default("").notNull(),
  reminder:  text("reminder").notNull(),
  remindAt:  timestamp("remind_at").notNull(),
  sent:      boolean("sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Reminder = typeof remindersTable.$inferSelect;
