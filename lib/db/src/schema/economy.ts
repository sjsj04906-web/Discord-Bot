import { pgTable, serial, text, integer, bigint, timestamp, unique } from "drizzle-orm/pg-core";

export const economyTable = pgTable("economy", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  userId:       text("user_id").notNull(),
  balance:      bigint("balance",      { mode: "number" }).default(0).notNull(),
  bankBalance:  bigint("bank_balance", { mode: "number" }).default(0).notNull(),
  lastDaily:    timestamp("last_daily"),
  dailyStreak:  integer("daily_streak").default(0).notNull(),
  lastWork:     timestamp("last_work"),
  lastRob:      timestamp("last_rob"),
  lastFish:     timestamp("last_fish"),
  lastHourly:   timestamp("last_hourly"),
  lastInterest: timestamp("last_interest"),
  totalEarned:  bigint("total_earned", { mode: "number" }).default(0).notNull(),
  fishCount:    integer("fish_count").default(0).notNull(),
  robSuccesses: integer("rob_successes").default(0).notNull(),
  bjWins:       integer("bj_wins").default(0).notNull(),
  heistCount:   integer("heist_count").default(0).notNull(),
  prestige:     integer("prestige").default(0).notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId) }));

export const userAchievementsTable = pgTable("user_achievements", {
  id:            serial("id").primaryKey(),
  guildId:       text("guild_id").notNull(),
  userId:        text("user_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  unlockedAt:    timestamp("unlocked_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId, t.achievementId) }));

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
