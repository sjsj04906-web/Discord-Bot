// Neural Data Exchange — DB helper layer
import {
  db,
  stockStateTable, stockPricesTable, stockHoldingsTable, stockOrdersTable,
  stockShortsTable, stockOptionsTable, stockBondsTable, stockEarningsTable,
  stockEventsTable, stockIposTable, stockIpoAllocsTable, stockBotStateTable,
  stockSentimentTable, neuralBankTable, stockTakeoversTable,
} from "@workspace/db";
import { eq, and, desc, asc, lt, lte, gt, sql, inArray, isNull } from "drizzle-orm";
import { CORPS, getCorpMeta } from "./stockEngine.js";
import type { StockState, StockHolding, StockOrder, StockShort, StockOption, StockBond, StockEvent } from "@workspace/db";

// ─── Market initialisation ────────────────────────────────────────────────────

/** Ensure all 8 corps exist in stock_state for this guild. */
export async function initMarket(guildId: string): Promise<void> {
  for (const corp of CORPS) {
    await db.insert(stockStateTable).values({
      guildId,
      ticker:        corp.ticker,
      price:         corp.initPrice,
      prevPrice:     corp.initPrice,
      floatShares:   corp.floatShares,
      dividendYield: corp.dividendYield,
      impliedVol:    corp.volatility * 100, // e.g. 20% → 2000 bps
    }).onConflictDoNothing();
  }
  // Seed NPC bot budgets
  for (const botId of ["ARBITRON", "MOMENTUM9", "GHOST"]) {
    for (const corp of CORPS) {
      await db.insert(stockBotStateTable).values({
        guildId,
        botId,
        ticker:     corp.ticker,
        shares:     0,
        cashBudget: 500_000,
      }).onConflictDoNothing();
    }
  }
}

// ─── Stock state ──────────────────────────────────────────────────────────────

export async function getStates(guildId: string): Promise<StockState[]> {
  await initMarket(guildId);
  return db.select().from(stockStateTable).where(eq(stockStateTable.guildId, guildId));
}

export async function getState(guildId: string, ticker: string): Promise<StockState | null> {
  await initMarket(guildId);
  const rows = await db.select().from(stockStateTable).where(
    and(eq(stockStateTable.guildId, guildId), eq(stockStateTable.ticker, ticker))
  );
  return rows[0] ?? null;
}

export async function updatePrice(
  guildId: string,
  ticker: string,
  newPrice: number,
  volumeAdd = 0,
  haltUntil?: Date | null,
): Promise<void> {
  const current = await getState(guildId, ticker);
  if (!current) return;

  await db.update(stockStateTable)
    .set({
      prevPrice:    current.price,
      price:        newPrice,
      volume24h:    current.volume24h + volumeAdd,
      haltedUntil:  haltUntil !== undefined ? haltUntil : current.haltedUntil,
      lastTickAt:   new Date(),
      tickCount:    current.tickCount + 1,
    })
    .where(and(eq(stockStateTable.guildId, guildId), eq(stockStateTable.ticker, ticker)));

  // Record price history
  await db.insert(stockPricesTable).values({
    guildId,
    ticker,
    open:   current.price,
    high:   Math.max(current.price, newPrice),
    low:    Math.min(current.price, newPrice),
    close:  newPrice,
    volume: volumeAdd,
  });
}

export async function haltTrading(guildId: string, ticker: string, untilMs: number): Promise<void> {
  await db.update(stockStateTable)
    .set({ haltedUntil: new Date(untilMs) })
    .where(and(eq(stockStateTable.guildId, guildId), eq(stockStateTable.ticker, ticker)));
}

export async function resetVolume24h(guildId: string): Promise<void> {
  await db.update(stockStateTable)
    .set({ volume24h: 0 })
    .where(eq(stockStateTable.guildId, guildId));
}

// ─── Price history ────────────────────────────────────────────────────────────

export async function getPriceHistory(guildId: string, ticker: string, limit = 10) {
  return db.select()
    .from(stockPricesTable)
    .where(and(eq(stockPricesTable.guildId, guildId), eq(stockPricesTable.ticker, ticker)))
    .orderBy(desc(stockPricesTable.snapshotAt))
    .limit(limit);
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export async function getHolding(guildId: string, userId: string, ticker: string): Promise<StockHolding | null> {
  const rows = await db.select().from(stockHoldingsTable).where(
    and(eq(stockHoldingsTable.guildId, guildId), eq(stockHoldingsTable.userId, userId), eq(stockHoldingsTable.ticker, ticker))
  );
  return rows[0] ?? null;
}

export async function getHoldings(guildId: string, userId: string): Promise<StockHolding[]> {
  return db.select().from(stockHoldingsTable).where(
    and(eq(stockHoldingsTable.guildId, guildId), eq(stockHoldingsTable.userId, userId))
  );
}

export async function getAllHoldingsForTicker(guildId: string, ticker: string): Promise<StockHolding[]> {
  return db.select().from(stockHoldingsTable).where(
    and(eq(stockHoldingsTable.guildId, guildId), eq(stockHoldingsTable.ticker, ticker))
  );
}

export async function upsertHolding(
  guildId: string, userId: string, ticker: string, shares: number, avgCost: number,
): Promise<void> {
  if (shares <= 0) {
    await db.delete(stockHoldingsTable).where(
      and(eq(stockHoldingsTable.guildId, guildId), eq(stockHoldingsTable.userId, userId), eq(stockHoldingsTable.ticker, ticker))
    );
    return;
  }
  await db.insert(stockHoldingsTable)
    .values({ guildId, userId, ticker, shares, avgCost })
    .onConflictDoUpdate({
      target: [stockHoldingsTable.guildId, stockHoldingsTable.userId, stockHoldingsTable.ticker],
      set: { shares, avgCost },
    });
}

/** Compute total shares of a ticker held by all users (for takeover % calcs). */
export async function totalSharesHeld(guildId: string, ticker: string): Promise<number> {
  const rows = await db.select({ shares: stockHoldingsTable.shares }).from(stockHoldingsTable)
    .where(and(eq(stockHoldingsTable.guildId, guildId), eq(stockHoldingsTable.ticker, ticker)));
  return rows.reduce((s, r) => s + r.shares, 0);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function addOrder(
  guildId: string, userId: string, ticker: string,
  side: string, orderType: string, shares: number,
  limitPrice?: number, leverage = false, fillsAt?: Date,
): Promise<number> {
  const rows = await db.insert(stockOrdersTable)
    .values({ guildId, userId, ticker, side, orderType, shares, limitPrice, leverage, fillsAt })
    .returning({ id: stockOrdersTable.id });
  return rows[0]!.id;
}

export async function getUserOrders(guildId: string, userId: string): Promise<StockOrder[]> {
  return db.select().from(stockOrdersTable).where(
    and(
      eq(stockOrdersTable.guildId, guildId),
      eq(stockOrdersTable.userId, userId),
      eq(stockOrdersTable.status, "open"),
    )
  ).orderBy(desc(stockOrdersTable.createdAt));
}

export async function getOpenOrders(guildId: string): Promise<StockOrder[]> {
  return db.select().from(stockOrdersTable).where(
    and(eq(stockOrdersTable.guildId, guildId), eq(stockOrdersTable.status, "open"))
  );
}

export async function cancelOrder(id: number, guildId: string, userId: string): Promise<StockOrder | null> {
  const rows = await db.select().from(stockOrdersTable).where(
    and(eq(stockOrdersTable.id, id), eq(stockOrdersTable.guildId, guildId), eq(stockOrdersTable.userId, userId), eq(stockOrdersTable.status, "open"))
  );
  if (!rows[0]) return null;
  await db.update(stockOrdersTable).set({ status: "cancelled" }).where(eq(stockOrdersTable.id, id));
  return rows[0];
}

export async function fillOrder(id: number, price: number): Promise<void> {
  await db.update(stockOrdersTable)
    .set({ status: "filled", filledAt: new Date(), filledPrice: price })
    .where(eq(stockOrdersTable.id, id));
}

export async function getDarkPoolOrders(guildId: string): Promise<StockOrder[]> {
  return db.select().from(stockOrdersTable).where(
    and(
      eq(stockOrdersTable.guildId, guildId),
      eq(stockOrdersTable.orderType, "dark"),
      eq(stockOrdersTable.status, "open"),
      lte(stockOrdersTable.fillsAt, new Date()),
    )
  );
}

// ─── Shorts ───────────────────────────────────────────────────────────────────

export async function openShort(
  guildId: string, userId: string, ticker: string,
  shares: number, entryPrice: number, collateral: number,
): Promise<number> {
  const rows = await db.insert(stockShortsTable)
    .values({ guildId, userId, ticker, shares, entryPrice, collateral })
    .returning({ id: stockShortsTable.id });
  return rows[0]!.id;
}

export async function getShorts(guildId: string, userId: string): Promise<StockShort[]> {
  return db.select().from(stockShortsTable).where(
    and(eq(stockShortsTable.guildId, guildId), eq(stockShortsTable.userId, userId), eq(stockShortsTable.status, "open"))
  );
}

export async function getShort(guildId: string, userId: string, ticker: string): Promise<StockShort | null> {
  const rows = await db.select().from(stockShortsTable).where(
    and(eq(stockShortsTable.guildId, guildId), eq(stockShortsTable.userId, userId), eq(stockShortsTable.ticker, ticker), eq(stockShortsTable.status, "open"))
  );
  return rows[0] ?? null;
}

export async function getAllOpenShorts(guildId: string): Promise<StockShort[]> {
  return db.select().from(stockShortsTable).where(
    and(eq(stockShortsTable.guildId, guildId), eq(stockShortsTable.status, "open"))
  );
}

export async function closeShort(id: number): Promise<void> {
  await db.update(stockShortsTable).set({ status: "closed" }).where(eq(stockShortsTable.id, id));
}

export async function updateShortCollateral(id: number, collateral: number): Promise<void> {
  await db.update(stockShortsTable)
    .set({ collateral, feeAccruedAt: new Date() })
    .where(eq(stockShortsTable.id, id));
}

// ─── Options ──────────────────────────────────────────────────────────────────

export async function openOption(
  guildId: string, userId: string, ticker: string,
  optionType: string, strike: number, expiryTicks: number,
  premium: number, lots: number,
): Promise<number> {
  const expiresAt = new Date(Date.now() + expiryTicks * 2 * 60 * 60_000);
  const rows = await db.insert(stockOptionsTable)
    .values({ guildId, userId, ticker, optionType, strike, expiryTicks, premium, lots, expiresAt })
    .returning({ id: stockOptionsTable.id });
  return rows[0]!.id;
}

export async function getUserOptions(guildId: string, userId: string): Promise<StockOption[]> {
  return db.select().from(stockOptionsTable).where(
    and(eq(stockOptionsTable.guildId, guildId), eq(stockOptionsTable.userId, userId), eq(stockOptionsTable.status, "open"))
  );
}

export async function getExpiredOptions(guildId: string): Promise<StockOption[]> {
  return db.select().from(stockOptionsTable).where(
    and(eq(stockOptionsTable.guildId, guildId), eq(stockOptionsTable.status, "open"), lte(stockOptionsTable.expiresAt, new Date()))
  );
}

export async function setOptionStatus(id: number, status: string): Promise<void> {
  await db.update(stockOptionsTable).set({ status }).where(eq(stockOptionsTable.id, id));
}

// ─── Bonds ────────────────────────────────────────────────────────────────────

export async function buyBond(
  guildId: string, userId: string, bondType: string,
  principal: number, yieldBps: number, maturesAt: Date,
): Promise<number> {
  const rows = await db.insert(stockBondsTable)
    .values({ guildId, userId, bondType, principal, yieldBps, maturesAt })
    .returning({ id: stockBondsTable.id });
  return rows[0]!.id;
}

export async function getUserBonds(guildId: string, userId: string): Promise<StockBond[]> {
  return db.select().from(stockBondsTable).where(
    and(eq(stockBondsTable.guildId, guildId), eq(stockBondsTable.userId, userId), eq(stockBondsTable.status, "active"))
  );
}

export async function getMaturedBonds(guildId: string): Promise<StockBond[]> {
  return db.select().from(stockBondsTable).where(
    and(eq(stockBondsTable.guildId, guildId), eq(stockBondsTable.status, "active"), lte(stockBondsTable.maturesAt, new Date()))
  );
}

export async function setBondStatus(id: number, status: string): Promise<void> {
  await db.update(stockBondsTable).set({ status }).where(eq(stockBondsTable.id, id));
}

export async function junkBondDefault(id: number): Promise<boolean> {
  // 8% chance of default on maturity for junk bonds
  if (Math.random() < 0.08) {
    await db.update(stockBondsTable).set({ status: "defaulted" }).where(eq(stockBondsTable.id, id));
    return true;
  }
  await db.update(stockBondsTable).set({ status: "matured" }).where(eq(stockBondsTable.id, id));
  return false;
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export async function scheduleEarnings(
  guildId: string, ticker: string,
  analystEstimate: number, actualResult: number, revealAt: Date,
): Promise<void> {
  await db.insert(stockEarningsTable)
    .values({ guildId, ticker, analystEstimate, actualResult, revealAt });
}

export async function getPendingEarnings(guildId: string) {
  return db.select().from(stockEarningsTable).where(
    and(
      eq(stockEarningsTable.guildId, guildId),
      eq(stockEarningsTable.revealed, false),
      lte(stockEarningsTable.revealAt, new Date()),
    )
  );
}

export async function getUpcomingEarnings(guildId: string) {
  return db.select().from(stockEarningsTable).where(
    and(eq(stockEarningsTable.guildId, guildId), eq(stockEarningsTable.revealed, false))
  ).orderBy(asc(stockEarningsTable.revealAt)).limit(10);
}

export async function markEarningsRevealed(id: number, impactBps: number): Promise<void> {
  await db.update(stockEarningsTable).set({ revealed: true, impactBps }).where(eq(stockEarningsTable.id, id));
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function logEvent(
  guildId: string, eventType: string, headline: string,
  ticker?: string, priceImpactBps?: number,
): Promise<void> {
  await db.insert(stockEventsTable).values({ guildId, ticker, eventType, headline, priceImpactBps });
}

export async function getRecentEvents(guildId: string, limit = 10): Promise<StockEvent[]> {
  return db.select().from(stockEventsTable)
    .where(eq(stockEventsTable.guildId, guildId))
    .orderBy(desc(stockEventsTable.occurredAt))
    .limit(limit);
}

// ─── IPOs ─────────────────────────────────────────────────────────────────────

export async function scheduleIpo(
  guildId: string, ticker: string, corpName: string,
  ipoPrice: number, offeringStart: Date, offeringEnd: Date,
  maxPerUser: number, totalShares: number,
): Promise<number> {
  const rows = await db.insert(stockIposTable)
    .values({ guildId, ticker, corpName, ipoPrice, offeringStart, offeringEnd, maxPerUser, totalShares })
    .returning({ id: stockIposTable.id });
  return rows[0]!.id;
}

export async function getOpenIpos(guildId: string) {
  return db.select().from(stockIposTable).where(
    and(eq(stockIposTable.guildId, guildId), eq(stockIposTable.status, "open"))
  );
}

export async function getScheduledIpos(guildId: string) {
  return db.select().from(stockIposTable).where(
    and(eq(stockIposTable.guildId, guildId), inArray(stockIposTable.status, ["scheduled", "open"]))
  ).orderBy(asc(stockIposTable.offeringStart));
}

export async function getUserIpoAlloc(guildId: string, ipoId: number, userId: string) {
  const rows = await db.select().from(stockIpoAllocsTable).where(
    and(eq(stockIpoAllocsTable.guildId, guildId), eq(stockIpoAllocsTable.ipoId, ipoId), eq(stockIpoAllocsTable.userId, userId))
  );
  return rows[0] ?? null;
}

export async function addIpoAlloc(guildId: string, ipoId: number, userId: string, shares: number): Promise<void> {
  await db.insert(stockIpoAllocsTable).values({ guildId, ipoId, userId, shares })
    .onConflictDoUpdate({
      target: [stockIpoAllocsTable.guildId, stockIpoAllocsTable.ipoId, stockIpoAllocsTable.userId],
      set: { shares: sql`${stockIpoAllocsTable.shares} + ${shares}` },
    });
}

export async function getIpoTotalAllocated(guildId: string, ipoId: number): Promise<number> {
  const rows = await db.select({ shares: stockIpoAllocsTable.shares }).from(stockIpoAllocsTable)
    .where(and(eq(stockIpoAllocsTable.guildId, guildId), eq(stockIpoAllocsTable.ipoId, ipoId)));
  return rows.reduce((s, r) => s + r.shares, 0);
}

export async function setIpoStatus(id: number, status: string): Promise<void> {
  await db.update(stockIposTable).set({ status }).where(eq(stockIposTable.id, id));
}

export async function getIpoAllocs(guildId: string, ipoId: number) {
  return db.select().from(stockIpoAllocsTable)
    .where(and(eq(stockIpoAllocsTable.guildId, guildId), eq(stockIpoAllocsTable.ipoId, ipoId)));
}

// ─── NPC bot state ────────────────────────────────────────────────────────────

export async function getBotState(guildId: string, botId: string, ticker: string) {
  const rows = await db.select().from(stockBotStateTable).where(
    and(eq(stockBotStateTable.guildId, guildId), eq(stockBotStateTable.botId, botId), eq(stockBotStateTable.ticker, ticker))
  );
  return rows[0] ?? null;
}

export async function getBotStates(guildId: string, botId: string) {
  return db.select().from(stockBotStateTable).where(
    and(eq(stockBotStateTable.guildId, guildId), eq(stockBotStateTable.botId, botId))
  );
}

export async function updateBotState(
  guildId: string, botId: string, ticker: string, shares: number, cashBudget: number,
): Promise<void> {
  await db.update(stockBotStateTable)
    .set({ shares, cashBudget, updatedAt: new Date() })
    .where(and(eq(stockBotStateTable.guildId, guildId), eq(stockBotStateTable.botId, botId), eq(stockBotStateTable.ticker, ticker)));
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

// In-memory buffer to avoid DB write on every message
const sentimentBuffer = new Map<string, number>(); // guildId → count

export function bufferSentiment(guildId: string): void {
  sentimentBuffer.set(guildId, (sentimentBuffer.get(guildId) ?? 0) + 1);
}

export async function flushSentiment(): Promise<void> {
  const now = new Date();
  const hourBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  for (const [guildId, count] of sentimentBuffer) {
    await db.insert(stockSentimentTable)
      .values({ guildId, hourBucket, messageCount: count })
      .onConflictDoUpdate({
        target: [stockSentimentTable.guildId, stockSentimentTable.hourBucket],
        set: { messageCount: sql`${stockSentimentTable.messageCount} + ${count}` },
      });
  }
  sentimentBuffer.clear();
}

export async function getSentimentCount(guildId: string): Promise<number> {
  const since = new Date(Date.now() - 6 * 60 * 60_000);
  const rows = await db.select({ c: stockSentimentTable.messageCount }).from(stockSentimentTable)
    .where(and(eq(stockSentimentTable.guildId, guildId), gt(stockSentimentTable.hourBucket, since)));
  return rows.reduce((s, r) => s + r.c, 0);
}

// ─── Neural Bank ──────────────────────────────────────────────────────────────

export async function getNeuralBankRate(guildId: string): Promise<number> {
  const rows = await db.select().from(neuralBankTable).where(eq(neuralBankTable.guildId, guildId));
  if (rows[0]) return rows[0].baseRateBps;
  await db.insert(neuralBankTable).values({ guildId, baseRateBps: 500 }).onConflictDoNothing();
  return 500;
}

export async function setNeuralBankRate(guildId: string, bps: number, userId: string): Promise<void> {
  await db.insert(neuralBankTable)
    .values({ guildId, baseRateBps: bps, updatedBy: userId })
    .onConflictDoUpdate({
      target: neuralBankTable.guildId,
      set: { baseRateBps: bps, updatedAt: new Date(), updatedBy: userId },
    });
}

// ─── Takeovers ────────────────────────────────────────────────────────────────

export async function getActiveTakeover(guildId: string, ticker: string) {
  const rows = await db.select().from(stockTakeoversTable).where(
    and(eq(stockTakeoversTable.guildId, guildId), eq(stockTakeoversTable.ticker, ticker), eq(stockTakeoversTable.status, "active"))
  );
  return rows[0] ?? null;
}

export async function launchTakeover(
  guildId: string, ticker: string, raiderId: string, bidPrice: number,
): Promise<number> {
  const endsAt = new Date(Date.now() + 48 * 60 * 60_000);
  const rows = await db.insert(stockTakeoversTable)
    .values({ guildId, ticker, raiderId, bidPrice, endsAt })
    .returning({ id: stockTakeoversTable.id });
  return rows[0]!.id;
}

export async function setTakeoverStatus(id: number, status: string): Promise<void> {
  await db.update(stockTakeoversTable).set({ status }).where(eq(stockTakeoversTable.id, id));
}

export async function getExpiredTakeovers(guildId: string) {
  return db.select().from(stockTakeoversTable).where(
    and(eq(stockTakeoversTable.guildId, guildId), eq(stockTakeoversTable.status, "active"), lte(stockTakeoversTable.endsAt, new Date()))
  );
}

// ─── Portfolio helpers ────────────────────────────────────────────────────────

export async function getAllHolders(guildId: string) {
  const rows = await db.select({
    userId:  stockHoldingsTable.userId,
    ticker:  stockHoldingsTable.ticker,
    shares:  stockHoldingsTable.shares,
    avgCost: stockHoldingsTable.avgCost,
  }).from(stockHoldingsTable).where(eq(stockHoldingsTable.guildId, guildId));
  return rows;
}
