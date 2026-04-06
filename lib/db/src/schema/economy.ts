import { pgTable, serial, text, integer, bigint, timestamp, unique } from "drizzle-orm/pg-core";

export const economyTable = pgTable("economy", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  balance:     bigint("balance",      { mode: "number" }).default(0).notNull(),
  bankBalance: bigint("bank_balance", { mode: "number" }).default(0).notNull(),
  lastDaily:   timestamp("last_daily"),
  dailyStreak: integer("daily_streak").default(0).notNull(),
  lastWork:    timestamp("last_work"),
  lastRob:     timestamp("last_rob"),
  lastFish:    timestamp("last_fish"),
  lastHourly:  timestamp("last_hourly"),
  totalEarned: bigint("total_earned", { mode: "number" }).default(0).notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId) }));

export const shopTable = pgTable("economy_shop", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  name:        text("name").notNull(),
  description: text("description").default("").notNull(),
  price:       bigint("price", { mode: "number" }).notNull(),
  roleId:      text("role_id").default("").notNull(),
});

export type EconomyUser = typeof economyTable.$inferSelect;
export type ShopItem    = typeof shopTable.$inferSelect;
