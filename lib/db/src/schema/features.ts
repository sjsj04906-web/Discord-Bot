import { pgTable, serial, text, integer, bigint, timestamp, boolean, unique } from "drizzle-orm/pg-core";

// ── Black Market inventory ────────────────────────────────────────────────────
export const marketInventoryTable = pgTable("market_inventory", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  itemId:      text("item_id").notNull(),
  acquiredAt:  timestamp("acquired_at").defaultNow().notNull(),
  usedAt:      timestamp("used_at"),
  expiresAt:   timestamp("expires_at"),
});

export type MarketItem = typeof marketInventoryTable.$inferSelect;

// ── Bounties ──────────────────────────────────────────────────────────────────
export const bountiesTable = pgTable("bounties", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  targetId:    text("target_id").notNull(),
  posterId:    text("poster_id").notNull(),
  amount:      bigint("amount", { mode: "number" }).notNull(),
  active:      boolean("active").default(true).notNull(),
  claimedBy:   text("claimed_by"),
  claimedAt:   timestamp("claimed_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.targetId, t.posterId) }));

export type Bounty = typeof bountiesTable.$inferSelect;

// ── Lottery ───────────────────────────────────────────────────────────────────
export const lotteryStateTable = pgTable("lottery_state", {
  id:             serial("id").primaryKey(),
  guildId:        text("guild_id").notNull().unique(),
  pot:            bigint("pot", { mode: "number" }).default(0).notNull(),
  endsAt:         timestamp("ends_at").notNull(),
  lastWinnerId:   text("last_winner_id"),
  lastWonAmount:  bigint("last_won_amount", { mode: "number" }),
  lastDrawAt:     timestamp("last_draw_at"),
});

export const lotteryTicketsTable = pgTable("lottery_tickets", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  count:       integer("count").default(0).notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId) }));

export type LotteryState   = typeof lotteryStateTable.$inferSelect;
export type LotteryTickets = typeof lotteryTicketsTable.$inferSelect;

// ── Daily Quests ──────────────────────────────────────────────────────────────
export const userQuestsTable = pgTable("user_quests", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  userId:       text("user_id").notNull(),
  questType:    text("quest_type").notNull(),
  label:        text("label").notNull(),
  target:       integer("target").notNull(),
  progress:     integer("progress").default(0).notNull(),
  rewardCoins:  bigint("reward_coins", { mode: "number" }).notNull(),
  rewardXp:     integer("reward_xp").notNull(),
  completedAt:  timestamp("completed_at"),
  expiresAt:    timestamp("expires_at").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type UserQuest = typeof userQuestsTable.$inferSelect;
