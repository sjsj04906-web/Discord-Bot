import { pgTable, text, integer } from "drizzle-orm/pg-core";

export const countingTable = pgTable("counting", {
  guildId:      text("guild_id").primaryKey(),
  channelId:    text("channel_id").default("").notNull(),
  currentCount: integer("current_count").default(0).notNull(),
  lastUserId:   text("last_user_id").default("").notNull(),
  highScore:    integer("high_score").default(0).notNull(),
});

export type CountingState = typeof countingTable.$inferSelect;
