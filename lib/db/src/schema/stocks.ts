import { pgTable, serial, text, integer, bigint, timestamp, boolean, unique } from "drizzle-orm/pg-core";

// ── Stock state: current live price + corp metadata per guild ─────────────────
export const stockStateTable = pgTable("stock_state", {
  id:            serial("id").primaryKey(),
  guildId:       text("guild_id").notNull(),
  ticker:        text("ticker").notNull(),
  price:         integer("price").notNull(),
  prevPrice:     integer("prev_price").notNull(),
  floatShares:   integer("float_shares").notNull(),
  volume24h:     integer("volume_24h").default(0).notNull(),
  haltedUntil:   timestamp("halted_until"),
  lastTickAt:    timestamp("last_tick_at").defaultNow().notNull(),
  tickCount:     integer("tick_count").default(0).notNull(),
  dividendYield: integer("dividend_yield").default(0).notNull(),
  impliedVol:    integer("implied_vol").default(2000).notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.ticker) }));

export type StockState = typeof stockStateTable.$inferSelect;

// ── OHLCV price history (one row per corp per tick) ───────────────────────────
export const stockPricesTable = pgTable("stock_prices", {
  id:         serial("id").primaryKey(),
  guildId:    text("guild_id").notNull(),
  ticker:     text("ticker").notNull(),
  open:       integer("open").notNull(),
  high:       integer("high").notNull(),
  low:        integer("low").notNull(),
  close:      integer("close").notNull(),
  volume:     integer("volume").default(0).notNull(),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
});

export type StockPrice = typeof stockPricesTable.$inferSelect;

// ── User long holdings ────────────────────────────────────────────────────────
export const stockHoldingsTable = pgTable("stock_holdings", {
  id:      serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId:  text("user_id").notNull(),
  ticker:  text("ticker").notNull(),
  shares:  integer("shares").notNull(),
  avgCost: integer("avg_cost").notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.userId, t.ticker) }));

export type StockHolding = typeof stockHoldingsTable.$inferSelect;

// ── Open limit / stop / dark-pool orders ─────────────────────────────────────
export const stockOrdersTable = pgTable("stock_orders", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  ticker:      text("ticker").notNull(),
  side:        text("side").notNull(),       // "buy" | "sell"
  orderType:   text("order_type").notNull(), // "limit" | "stop" | "dark"
  shares:      integer("shares").notNull(),
  limitPrice:  integer("limit_price"),
  leverage:    boolean("leverage").default(false).notNull(),
  status:      text("status").default("open").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  fillsAt:     timestamp("fills_at"),
  filledAt:    timestamp("filled_at"),
  filledPrice: integer("filled_price"),
});

export type StockOrder = typeof stockOrdersTable.$inferSelect;

// ── Short positions ───────────────────────────────────────────────────────────
export const stockShortsTable = pgTable("stock_shorts", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  userId:       text("user_id").notNull(),
  ticker:       text("ticker").notNull(),
  shares:       integer("shares").notNull(),
  entryPrice:   integer("entry_price").notNull(),
  collateral:   integer("collateral").notNull(),
  feeAccruedAt: timestamp("fee_accrued_at").defaultNow().notNull(),
  openedAt:     timestamp("opened_at").defaultNow().notNull(),
  status:       text("status").default("open").notNull(),
});

export type StockShort = typeof stockShortsTable.$inferSelect;

// ── Options contracts ─────────────────────────────────────────────────────────
export const stockOptionsTable = pgTable("stock_options", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  ticker:      text("ticker").notNull(),
  optionType:  text("option_type").notNull(), // "call" | "put"
  strike:      integer("strike").notNull(),
  expiryTicks: integer("expiry_ticks").notNull(),
  premium:     integer("premium").notNull(),
  lots:        integer("lots").default(1).notNull(),
  status:      text("status").default("open").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  expiresAt:   timestamp("expires_at").notNull(),
});

export type StockOption = typeof stockOptionsTable.$inferSelect;

// ── Bond positions ────────────────────────────────────────────────────────────
export const stockBondsTable = pgTable("stock_bonds", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  bondType:    text("bond_type").notNull(), // "junk" | "corp"
  principal:   bigint("principal", { mode: "number" }).notNull(),
  yieldBps:    integer("yield_bps").notNull(),
  maturesAt:   timestamp("matures_at").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  status:      text("status").default("active").notNull(),
});

export type StockBond = typeof stockBondsTable.$inferSelect;

// ── Scheduled earnings reports ────────────────────────────────────────────────
export const stockEarningsTable = pgTable("stock_earnings", {
  id:              serial("id").primaryKey(),
  guildId:         text("guild_id").notNull(),
  ticker:          text("ticker").notNull(),
  analystEstimate: integer("analyst_estimate").notNull(),
  actualResult:    integer("actual_result").notNull(),
  revealAt:        timestamp("reveal_at").notNull(),
  revealed:        boolean("revealed").default(false).notNull(),
  impactBps:       integer("impact_bps"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export type StockEarnings = typeof stockEarningsTable.$inferSelect;

// ── Market event log ──────────────────────────────────────────────────────────
export const stockEventsTable = pgTable("stock_events", {
  id:             serial("id").primaryKey(),
  guildId:        text("guild_id").notNull(),
  ticker:         text("ticker"),
  eventType:      text("event_type").notNull(),
  headline:       text("headline").notNull(),
  priceImpactBps: integer("price_impact_bps"),
  occurredAt:     timestamp("occurred_at").defaultNow().notNull(),
});

export type StockEvent = typeof stockEventsTable.$inferSelect;

// ── IPO schedule ──────────────────────────────────────────────────────────────
export const stockIposTable = pgTable("stock_ipos", {
  id:            serial("id").primaryKey(),
  guildId:       text("guild_id").notNull(),
  ticker:        text("ticker").notNull(),
  corpName:      text("corp_name").notNull(),
  ipoPrice:      integer("ipo_price").notNull(),
  offeringStart: timestamp("offering_start").notNull(),
  offeringEnd:   timestamp("offering_end").notNull(),
  maxPerUser:    integer("max_per_user").notNull(),
  totalShares:   integer("total_shares").notNull(),
  status:        text("status").default("scheduled").notNull(),
});

export type StockIpo = typeof stockIposTable.$inferSelect;

// ── IPO user allocations ──────────────────────────────────────────────────────
export const stockIpoAllocsTable = pgTable("stock_ipo_allocs", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  ipoId:     integer("ipo_id").notNull(),
  userId:    text("user_id").notNull(),
  shares:    integer("shares").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.ipoId, t.userId) }));

export type StockIpoAlloc = typeof stockIpoAllocsTable.$inferSelect;

// ── NPC bot state ─────────────────────────────────────────────────────────────
export const stockBotStateTable = pgTable("stock_bot_state", {
  id:         serial("id").primaryKey(),
  guildId:    text("guild_id").notNull(),
  botId:      text("bot_id").notNull(),
  ticker:     text("ticker").notNull(),
  shares:     integer("shares").default(0).notNull(),
  cashBudget: bigint("cash_budget", { mode: "number" }).default(500_000).notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.botId, t.ticker) }));

export type StockBotState = typeof stockBotStateTable.$inferSelect;

// ── Hourly sentiment buckets ──────────────────────────────────────────────────
export const stockSentimentTable = pgTable("stock_sentiment", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  hourBucket:   timestamp("hour_bucket").notNull(),
  messageCount: integer("message_count").default(0).notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.hourBucket) }));

// ── Neural Bank (admin-controlled base rate) ──────────────────────────────────
export const neuralBankTable = pgTable("neural_bank", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull().unique(),
  baseRateBps: integer("base_rate_bps").default(500).notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
  updatedBy:   text("updated_by"),
});

export type NeuralBank = typeof neuralBankTable.$inferSelect;

// ── Active hostile takeovers ──────────────────────────────────────────────────
export const stockTakeoversTable = pgTable("stock_takeovers", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  ticker:    text("ticker").notNull(),
  raiderId:  text("raider_id").notNull(),
  bidPrice:  integer("bid_price").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endsAt:    timestamp("ends_at").notNull(),
  status:    text("status").default("active").notNull(),
}, (t) => ({ uniq: unique().on(t.guildId, t.ticker) }));

export type StockTakeover = typeof stockTakeoversTable.$inferSelect;
