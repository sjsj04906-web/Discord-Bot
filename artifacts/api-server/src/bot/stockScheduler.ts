// Neural Data Exchange — Background Scheduler
import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import {
  CORPS, getCorpMeta, arbitronSignal, momentum9Signal, generateGridEvent,
  generateFlashCrash, applyDrift, applyImpactBps, priceImpact,
  sentimentDrift, circuitBreakerThreshold, isHalted, sectorBleed,
  corpBondYield, junkBondYield, glitchIndex, trendArrow, pctStr,
} from "./stockEngine.js";
import {
  initMarket, getStates, getState, updatePrice, haltTrading, resetVolume24h,
  getPriceHistory, getHolding, getHoldings, getAllHoldingsForTicker, upsertHolding,
  getOpenOrders, getDarkPoolOrders, fillOrder, cancelOrder,
  getAllOpenShorts, updateShortCollateral, closeShort,
  getExpiredOptions, setOptionStatus,
  getMaturedBonds, setBondStatus, junkBondDefault,
  getBotState, getBotStates, updateBotState,
  scheduleEarnings, getPendingEarnings, getUpcomingEarnings, markEarningsRevealed,
  logEvent, getRecentEvents,
  getOpenIpos, setIpoStatus, getIpoAllocs, getScheduledIpos, scheduleIpo,
  getSentimentCount, flushSentiment,
  getNeuralBankRate,
  getExpiredTakeovers, setTakeoverStatus,
} from "./stockDb.js";
import { addBalance, deductBalance, getGuildConfig, updateGuildConfig } from "./db.js";
import { logger } from "../lib/logger.js";
import { THEME, BOT_NAME, SEP } from "./theme.js";

// ─── Find announcement channel ────────────────────────────────────────────────

async function findMarketChannel(guild: import("discord.js").Guild) {
  const keywords = ["stock", "market", "trading", "exchange", "ndx", "neural"];
  return guild.channels.cache.find(
    (c) =>
      c.isTextBased() &&
      keywords.some((kw) => c.name.toLowerCase().includes(kw)),
  ) as import("discord.js").TextChannel | undefined;
}

async function announce(client: Client, guildId: string, embed: EmbedBuilder) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const ch = await findMarketChannel(guild);
  if (!ch) return;
  await ch.send({ embeds: [embed] }).catch(() => {});
}

// ─── Main 2-hour price tick ───────────────────────────────────────────────────

async function runTick(client: Client) {
  const guilds = client.guilds.cache.map((g) => g.id);
  for (const guildId of guilds) {
    try {
      await processTick(client, guildId);
    } catch (err) {
      logger.error({ err, guildId }, "Stock tick error");
    }
  }
}

async function processTick(client: Client, guildId: string) {
  await initMarket(guildId);
  const states  = await getStates(guildId);
  const sentMsg = await getSentimentCount(guildId);
  const drift   = sentimentDrift(sentMsg);
  const baseRate = await getNeuralBankRate(guildId);

  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;

  const events: Array<{ ticker: string; headline: string; impactBps: number }> = [];

  // ── Flash crash: 2% chance per tick ──────────────────────────────────────
  const doFlash = Math.random() < 0.02;
  const flashTicker = doFlash ? CORPS[Math.floor(Math.random() * CORPS.length)]!.ticker : null;

  // ── Grid events: each corp 3% chance ─────────────────────────────────────
  const gridTickers: string[] = [];
  for (const corp of CORPS) {
    if (Math.random() < 0.03) gridTickers.push(corp.ticker);
  }

  // ── Process each corp ─────────────────────────────────────────────────────
  for (const state of states) {
    const corp = getCorpMeta(state.ticker);
    if (isHalted(state.haltedUntil)) continue;

    let newPrice = state.price;
    let volumeAdd = 0;

    // Flash crash overrides drift
    if (flashTicker === state.ticker) {
      const ev = generateFlashCrash(corp.name);
      newPrice = applyImpactBps(newPrice, ev.impactBps);
      events.push({ ticker: state.ticker, headline: ev.headline, impactBps: ev.impactBps });
      await logEvent(guildId, "flash_crash", ev.headline, state.ticker, ev.impactBps);
    } else if (gridTickers.includes(state.ticker)) {
      // Grid event
      const ev = generateGridEvent(corp.name);
      newPrice = applyImpactBps(newPrice, ev.impactBps);
      events.push({ ticker: state.ticker, headline: ev.headline, impactBps: ev.impactBps });
      await logEvent(guildId, "grid_event", ev.headline, state.ticker, ev.impactBps);

      // Sector bleed to correlated corps
      for (const other of CORPS) {
        if (other.ticker === state.ticker) continue;
        const bleed = sectorBleed(corp.sector, other.sector);
        if (bleed > 0.1) {
          const bleedImpact = Math.round(ev.impactBps * bleed);
          priceMap[other.ticker] = applyImpactBps(priceMap[other.ticker] ?? other.initPrice, bleedImpact);
        }
      }
    } else {
      // Normal drift tick with sentiment bias
      const history = await getPriceHistory(guildId, state.ticker, 5);
      const prevPrices = history.map((h) => h.close).reverse();

      // NPC: ARBITRON
      const arb = await getBotState(guildId, "ARBITRON", state.ticker);
      if (arb) {
        const maPrice = prevPrices.length >= 3 ? prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length : state.price;
        const sig = arbitronSignal(state.price, maPrice, Number(arb.cashBudget));
        if (sig.action === "buy" && Number(arb.cashBudget) >= state.price) {
          const cost = sig.shares * state.price;
          const impact = priceImpact(sig.shares, state.price, corp.liquidity, corp.floatShares);
          newPrice = Math.round(newPrice * (1 + impact));
          volumeAdd += sig.shares;
          await updateBotState(guildId, "ARBITRON", state.ticker, arb.shares + sig.shares, Number(arb.cashBudget) - cost);
        } else if (sig.action === "sell" && arb.shares > 0) {
          const actualSell = Math.min(sig.shares, arb.shares);
          const impact = priceImpact(actualSell, state.price, corp.liquidity, corp.floatShares);
          newPrice = Math.max(1, Math.round(newPrice * (1 - impact)));
          volumeAdd += actualSell;
          await updateBotState(guildId, "ARBITRON", state.ticker, arb.shares - actualSell, Number(arb.cashBudget) + actualSell * state.price);
        }
      }

      // NPC: MOMENTUM-9
      const mom = await getBotState(guildId, "MOMENTUM9", state.ticker);
      if (mom) {
        const sig = momentum9Signal(prevPrices, Number(mom.cashBudget), state.price);
        if (sig.action === "buy" && Number(mom.cashBudget) >= state.price) {
          const cost = sig.shares * state.price;
          const impact = priceImpact(sig.shares, state.price, corp.liquidity, corp.floatShares);
          newPrice = Math.round(newPrice * (1 + impact));
          volumeAdd += sig.shares;
          await updateBotState(guildId, "MOMENTUM9", state.ticker, mom.shares + sig.shares, Number(mom.cashBudget) - cost);
        } else if (sig.action === "sell" && mom.shares > 0) {
          const actualSell = Math.min(sig.shares, mom.shares);
          const impact = priceImpact(actualSell, state.price, corp.liquidity, corp.floatShares);
          newPrice = Math.max(1, Math.round(newPrice * (1 - impact)));
          volumeAdd += actualSell;
          await updateBotState(guildId, "MOMENTUM9", state.ticker, mom.shares - actualSell, Number(mom.cashBudget) + actualSell * state.price);
        }
      }

      // Standard drift (sentiment + random walk)
      newPrice = applyDrift(newPrice, drift, corp.volatility);
    }

    priceMap[state.ticker] = newPrice;

    // ── Circuit breaker ───────────────────────────────────────────────────
    const changePct = Math.abs((newPrice - state.price) / state.price) * 100;
    const threshold = circuitBreakerThreshold(corp.volatility);
    if (changePct >= threshold) {
      const haltUntil = Date.now() + 45 * 60_000;
      await haltTrading(guildId, state.ticker, haltUntil);
      const cbHeadline = `🚧 **CIRCUIT BREAKER** — ${corp.ticker} (${corp.name}) halted for 45 min after ${changePct.toFixed(1)}% swing.`;
      events.push({ ticker: state.ticker, headline: cbHeadline, impactBps: 0 });
      await logEvent(guildId, "circuit_breaker", cbHeadline, state.ticker);
    }

    await updatePrice(guildId, state.ticker, newPrice, volumeAdd);

    // ── Dividends ─────────────────────────────────────────────────────────
    if (corp.dividendYield > 0 && Math.random() < 0.15) { // ~15% chance each tick (~every 13hrs on avg)
      const holders = await getAllHoldingsForTicker(guildId, state.ticker);
      let paidCount = 0;
      for (const h of holders) {
        const annual = (h.shares * newPrice * corp.dividendYield) / 10_000;
        const perTick = Math.round(annual / (365 * 12)); // 2-hour ticks → ~12/day → ~4380/year
        if (perTick <= 0) continue;
        await addBalance(guildId, h.userId, perTick);
        paidCount++;
      }
      if (paidCount > 0) {
        const divHeadline = `💰 **${corp.ticker}** dividend distributed to ${paidCount} holder${paidCount > 1 ? "s" : ""}.`;
        await logEvent(guildId, "dividend", divHeadline, state.ticker);
      }
    }
  }

  // ── Reset 24h volume counter once per day (based on tick modulo) ──────────
  const firstState = states[0];
  if (firstState && (firstState.tickCount + 1) % 12 === 0) {
    await resetVolume24h(guildId);
  }

  // ── Short position fees (once per 2h tick) ────────────────────────────────
  await processShortFees(guildId);

  // ── Earnings reveals ──────────────────────────────────────────────────────
  const pendingEarnings = await getPendingEarnings(guildId);
  for (const earn of pendingEarnings) {
    const corp = getCorpMeta(earn.ticker);
    const beat = earn.actualResult > earn.analystEstimate;
    const deviation = ((earn.actualResult - earn.analystEstimate) / earn.analystEstimate) * 100;
    const impactBps = Math.round(deviation * 80); // 1% miss → -80bps impact
    const curState = await getState(guildId, earn.ticker);
    if (curState) {
      const newP = applyImpactBps(curState.price, impactBps);
      await updatePrice(guildId, earn.ticker, newP);
    }
    await markEarningsRevealed(earn.id, impactBps);
    const headline = `📊 **${earn.ticker} EARNINGS** — Actual: ${earn.actualResult.toLocaleString()} | Estimate: ${earn.analystEstimate.toLocaleString()} | ${beat ? "✅ BEAT" : "❌ MISS"} (${impactBps >= 0 ? "+" : ""}${(impactBps / 100).toFixed(1)}%)`;
    events.push({ ticker: earn.ticker, headline, impactBps });
    await logEvent(guildId, "earnings", headline, earn.ticker, impactBps);
  }

  // ── Announce events ────────────────────────────────────────────────────────
  if (events.length > 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF4D00)
      .setAuthor({ name: `⚡  Neural Data Exchange  ·  Market Events  ·  ${BOT_NAME}` })
      .setDescription(events.map((e) => e.headline).join("\n\n"))
      .setTimestamp();
    await announce(client, guildId, embed);
  }

  // ── Earnings announcements for the upcoming window ─────────────────────────
  const upcoming = await getUpcomingEarnings(guildId);
  for (const earn of upcoming) {
    const timeUntil = earn.revealAt.getTime() - Date.now();
    if (timeUntil > 0 && timeUntil < 2 * 60 * 60_000) { // within next 2h tick window
      const corp = getCorpMeta(earn.ticker);
      const embed = new EmbedBuilder()
        .setColor(THEME.warn)
        .setAuthor({ name: `📢  Earnings Alert  ·  ${BOT_NAME}` })
        .setDescription(`**${corp.ticker} — ${corp.name}** earnings report drops <t:${Math.floor(earn.revealAt.getTime() / 1000)}:R>.\n\n💡 Analyst estimate: **${earn.analystEstimate.toLocaleString()}**`)
        .setTimestamp();
      await announce(client, guildId, embed);
    }
  }

  // ── Schedule next round of earnings (if none pending) ─────────────────────
  const allPending = await getUpcomingEarnings(guildId);
  if (allPending.length === 0) {
    await scheduleAllEarnings(guildId);
  }

  // ── Update pinned live ticker message ──────────────────────────────────────
  await updateLiveTicker(client, guildId);
}

async function scheduleAllEarnings(guildId: string) {
  for (const corp of CORPS) {
    const revealAt = new Date(Date.now() + (3 + Math.random() * 4) * 24 * 60 * 60_000); // 3-7 days out
    const base = corp.initPrice * 1_000;
    const estimate = Math.round(base * (0.9 + Math.random() * 0.2));
    const actual   = Math.round(base * (0.85 + Math.random() * 0.30));
    await scheduleEarnings(guildId, corp.ticker, estimate, actual, revealAt);
  }
}

// ─── 10-minute order matcher ──────────────────────────────────────────────────

async function runOrderMatcher(client: Client) {
  const guilds = client.guilds.cache.map((g) => g.id);
  for (const guildId of guilds) {
    try {
      await processOrders(client, guildId);
      await processDarkPool(client, guildId);
      await processOptionExpiry(client, guildId);
      await processBondMaturities(client, guildId);
      await processTakeovers(client, guildId);
      await processIpoTransitions(client, guildId);
      // Refresh ticker after order fills may have moved prices
      await updateLiveTicker(client, guildId);
    } catch (err) {
      logger.error({ err, guildId }, "Order matcher error");
    }
  }
}

async function runTickerRefresh(client: Client) {
  const guilds = client.guilds.cache.map((g) => g.id);
  for (const guildId of guilds) {
    await updateLiveTicker(client, guildId).catch(() => {});
  }
}

async function processOrders(client: Client, guildId: string) {
  const openOrders = await getOpenOrders(guildId);
  for (const order of openOrders) {
    if (order.orderType === "dark") continue; // handled by dark pool
    const state = await getState(guildId, order.ticker);
    if (!state) continue;
    const price = state.price;

    let shouldFill = false;
    if (order.orderType === "limit") {
      if (order.side === "buy"  && price <= (order.limitPrice ?? 0)) shouldFill = true;
      if (order.side === "sell" && price >= (order.limitPrice ?? 999_999_999)) shouldFill = true;
    }
    if (order.orderType === "stop") {
      if (order.side === "sell" && price <= (order.limitPrice ?? 0)) shouldFill = true;
    }

    if (!shouldFill) continue;

    if (order.side === "buy") {
      await executeBuy(guildId, order.userId, order.ticker, order.shares, price, order.leverage);
      // Refund the price difference if filled cheaper than the locked limit price
      const lockedPrice = order.limitPrice ?? price;
      const lockedCost  = order.leverage ? Math.ceil((order.shares * lockedPrice) / 2) : order.shares * lockedPrice;
      const fillCost    = order.leverage ? Math.ceil((order.shares * price) / 2) : order.shares * price;
      const overpaid    = lockedCost - fillCost;
      if (overpaid > 0) await addBalance(guildId, order.userId, overpaid);
      await fillOrder(order.id, price);
      await notifyUser(client, guildId, order.userId,
        `✅ Limit buy filled: **${order.shares} ${order.ticker}** @ **${price.toLocaleString()}** coins${overpaid > 0 ? ` · **${overpaid.toLocaleString()}** coins refunded` : ""}`);
    } else {
      const holding = await getHolding(guildId, order.userId, order.ticker);
      if (!holding || holding.shares < order.shares) {
        await cancelOrder(order.id, guildId, order.userId);
        continue;
      }
      await executeSell(guildId, order.userId, order.ticker, order.shares, price);
      await fillOrder(order.id, price);
      await notifyUser(client, guildId, order.userId,
        `✅ ${order.orderType === "stop" ? "Stop-loss" : "Limit sell"} filled: **${order.shares} ${order.ticker}** @ **${price.toLocaleString()}** coins`);
    }
  }
}

async function processDarkPool(client: Client, guildId: string) {
  const ready = await getDarkPoolOrders(guildId);
  for (const order of ready) {
    const state = await getState(guildId, order.ticker);
    if (!state) continue;
    const fillPrice = state.price; // mid-price
    const fee = Math.round(order.shares * fillPrice * 0.005); // 0.5% fee

    if (order.side === "buy") {
      await executeBuy(guildId, order.userId, order.ticker, order.shares, fillPrice, false);
      await deductBalance(guildId, order.userId, fee); // 0.5% dark pool fee
      await fillOrder(order.id, fillPrice);
      await notifyUser(client, guildId, order.userId,
        `🌑 Dark pool buy filled: **${order.shares} ${order.ticker}** @ **${fillPrice.toLocaleString()}** coins · Fee: **${fee.toLocaleString()}** coins`);
    } else {
      const holding = await getHolding(guildId, order.userId, order.ticker);
      if (!holding || holding.shares < order.shares) { await cancelOrder(order.id, guildId, order.userId); continue; }
      await executeSell(guildId, order.userId, order.ticker, order.shares, fillPrice);
      await deductBalance(guildId, order.userId, fee); // deduct dark pool fee
      await fillOrder(order.id, fillPrice);
      await notifyUser(client, guildId, order.userId,
        `🌑 Dark pool order filled: **${order.shares} ${order.ticker}** @ **${fillPrice.toLocaleString()}** coins (fee: ${fee.toLocaleString()})`);
    }
  }
}

async function processShortFees(guildId: string) {
  const shorts = await getAllOpenShorts(guildId);
  const DAILY_FEE_BPS = 50; // 0.5% per day
  const TICK_FEE_BPS  = Math.round(DAILY_FEE_BPS / 12); // per 2hr tick

  for (const s of shorts) {
    const state = await getState(guildId, s.ticker);
    if (!state) continue;
    const feePerShare = Math.round(state.price * TICK_FEE_BPS / 10_000);
    const totalFee = feePerShare * s.shares;
    const newCollateral = s.collateral - totalFee;

    // Liquidate if collateral < 20% of position value
    const positionValue = s.shares * state.price;
    if (newCollateral < positionValue * 0.20) {
      // Auto-liquidate
      const profit = s.shares * (s.entryPrice - state.price) - totalFee;
      const payout = Math.max(0, s.collateral + profit);
      await addBalance(guildId, s.userId, payout);
      await closeShort(s.id);
    } else {
      await updateShortCollateral(s.id, newCollateral);
    }
  }
}

async function processOptionExpiry(client: Client, guildId: string) {
  const expired = await getExpiredOptions(guildId);
  for (const opt of expired) {
    const state = await getState(guildId, opt.ticker);
    if (!state) { await setOptionStatus(opt.id, "expired"); continue; }
    const isCall = opt.optionType === "call";
    const itm = isCall ? state.price > opt.strike : state.price < opt.strike;

    if (itm) {
      const intrinsic = isCall ? (state.price - opt.strike) : (opt.strike - state.price);
      const payout = intrinsic * opt.lots;
      if (payout > 0) await addBalance(guildId, opt.userId, payout);
      await setOptionStatus(opt.id, "exercised");
      await notifyUser(client, guildId, opt.userId,
        `✅ Option **${opt.optionType.toUpperCase()} ${opt.ticker} @${opt.strike}** exercised in-the-money. Payout: **${payout.toLocaleString()}** coins`);
    } else {
      await setOptionStatus(opt.id, "expired");
      await notifyUser(client, guildId, opt.userId,
        `❌ Option **${opt.optionType.toUpperCase()} ${opt.ticker} @${opt.strike}** expired worthless.`);
    }
  }
}

async function processBondMaturities(client: Client, guildId: string) {
  const matured = await getMaturedBonds(guildId);
  for (const bond of matured) {
    const days = (bond.maturesAt.getTime() - bond.purchasedAt.getTime()) / 86_400_000;
    const interest = Math.round(Number(bond.principal) * bond.yieldBps / 10_000 * (days / 365));

    if (bond.bondType === "junk") {
      const defaulted = await junkBondDefault(bond.id);
      if (defaulted) {
        await notifyUser(client, guildId, bond.userId,
          `💀 Your **Junk Bond** has defaulted! Principal of **${Number(bond.principal).toLocaleString()}** coins lost.`);
        continue;
      }
    } else {
      await setBondStatus(bond.id, "matured");
    }
    const payout = Number(bond.principal) + interest;
    await addBalance(guildId, bond.userId, payout);
    await notifyUser(client, guildId, bond.userId,
      `📄 **${bond.bondType === "corp" ? "Corp" : "Junk"} Bond** matured! Principal: **${Number(bond.principal).toLocaleString()}** + Interest: **${interest.toLocaleString()}** = **${payout.toLocaleString()}** coins`);
  }
}

async function processTakeovers(client: Client, guildId: string) {
  const expired = await getExpiredTakeovers(guildId);
  for (const takeover of expired) {
    const raiderHolding = await getHolding(guildId, takeover.raiderId, takeover.ticker);
    const corp = getCorpMeta(takeover.ticker);
    const raiderShares = raiderHolding?.shares ?? 0;
    const pctFloat = raiderShares / corp.floatShares;

    if (pctFloat >= 0.20) {
      await setTakeoverStatus(takeover.id, "success");
      await logEvent(guildId, "takeover", `🏴 **${takeover.ticker} TAKEOVER COMPLETE** — <@${takeover.raiderId}> now controls ${(pctFloat * 100).toFixed(1)}% of the float.`, takeover.ticker);
      await announce(client, guildId, new EmbedBuilder()
        .setColor(THEME.elite)
        .setAuthor({ name: `🏴  Hostile Takeover Complete  ·  ${BOT_NAME}` })
        .setDescription(`<@${takeover.raiderId}> has completed a hostile takeover of **${corp.ticker} (${corp.name})**.\nThey control **${(pctFloat * 100).toFixed(1)}%** of the float and will receive enhanced dividends.`)
        .setTimestamp());
    } else {
      await setTakeoverStatus(takeover.id, "failed");
    }
  }
}

async function processIpoTransitions(client: Client, guildId: string) {
  const scheduled = await getScheduledIpos(guildId);
  const now = new Date();
  for (const ipo of scheduled) {
    if (ipo.status === "scheduled" && ipo.offeringStart <= now) {
      await setIpoStatus(ipo.id, "open");
      const embed = new EmbedBuilder()
        .setColor(THEME.economy)
        .setAuthor({ name: `🚀  IPO Opening  ·  ${BOT_NAME}` })
        .setDescription(`**${ipo.ticker} — ${ipo.corpName}** is now open for IPO allocation!\nPrice: **${ipo.ipoPrice.toLocaleString()}** coins/share | Max per user: **${ipo.maxPerUser.toLocaleString()}** shares\nIPO closes <t:${Math.floor(ipo.offeringEnd.getTime() / 1000)}:R>`)
        .setFooter({ text: `Use /stocks ipo buy to participate` })
        .setTimestamp();
      await announce(client, guildId, embed);
    }
    if (ipo.status === "open" && ipo.offeringEnd <= now) {
      // Distribute IPO shares and add corp to market
      const allocs = await getIpoAllocs(guildId, ipo.id);
      for (const alloc of allocs) {
        await upsertHolding(guildId, alloc.userId, ipo.ticker, alloc.shares, ipo.ipoPrice);
      }
      await setIpoStatus(ipo.id, "listed");
      const embed = new EmbedBuilder()
        .setColor(THEME.success)
        .setAuthor({ name: `📈  IPO Listed  ·  ${BOT_NAME}` })
        .setDescription(`**${ipo.ticker} — ${ipo.corpName}** is now trading on the Neural Data Exchange!\nIPO price: **${ipo.ipoPrice.toLocaleString()}** coins | **${allocs.length}** investors allocated shares.`)
        .setTimestamp();
      await announce(client, guildId, embed);
    }
  }
}

// ─── DM notification helper ───────────────────────────────────────────────────

async function notifyUser(client: Client, guildId: string, userId: string, message: string) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;
  const embed = new EmbedBuilder()
    .setColor(THEME.economy)
    .setAuthor({ name: `📊  Neural Data Exchange  ·  ${BOT_NAME}` })
    .setDescription(message)
    .setTimestamp();
  await user.send({ embeds: [embed] }).catch(() => {});
}

// ─── Trade execution helpers ──────────────────────────────────────────────────

export async function executeBuy(
  guildId: string, userId: string, ticker: string,
  shares: number, price: number, leverage: boolean,
): Promise<void> {
  const totalCost = shares * price;
  const collateral = leverage ? Math.ceil(totalCost / 2) : totalCost;

  const existing = await getHolding(guildId, userId, ticker);
  if (existing) {
    const totalShares = existing.shares + shares;
    const newAvg = Math.round((existing.shares * existing.avgCost + shares * price) / totalShares);
    await upsertHolding(guildId, userId, ticker, totalShares, newAvg);
  } else {
    await upsertHolding(guildId, userId, ticker, shares, price);
  }

  // Apply price impact
  const corp = getCorpMeta(ticker);
  const state = await getState(guildId, ticker);
  if (state) {
    const impact = priceImpact(shares, price, corp.liquidity, state.floatShares);
    const newPrice = Math.round(state.price * (1 + impact));
    await updatePrice(guildId, ticker, newPrice, shares);
  }
}

export async function executeSell(
  guildId: string, userId: string, ticker: string,
  shares: number, price: number,
): Promise<number> {
  const proceeds = shares * price;
  const existing = await getHolding(guildId, userId, ticker);
  if (!existing) return 0;

  const remaining = existing.shares - shares;
  await upsertHolding(guildId, userId, ticker, remaining, existing.avgCost);
  await addBalance(guildId, userId, proceeds);

  // Apply price impact (downward)
  const corp = getCorpMeta(ticker);
  const state = await getState(guildId, ticker);
  if (state) {
    const impact = priceImpact(shares, price, corp.liquidity, state.floatShares);
    const newPrice = Math.max(1, Math.round(state.price * (1 - impact)));
    await updatePrice(guildId, ticker, newPrice, shares);
  }

  return proceeds;
}

// ─── Live ticker embed builder ────────────────────────────────────────────────

export function buildTickerEmbed(
  states: Awaited<ReturnType<typeof getStates>>,
  sentimentCount: number,
  nextTickMs: number,
): EmbedBuilder {
  const priceMap: Record<string, number> = {};
  const prevMap:  Record<string, number> = {};
  for (const s of states) {
    priceMap[s.ticker] = s.price;
    prevMap[s.ticker]  = s.prevPrice;
  }
  const idx     = Math.round(glitchIndex(priceMap));
  const prevIdx = Math.round(glitchIndex(prevMap));
  const idxArrow = trendArrow(idx, prevIdx);
  const idxPct   = pctStr(idx, prevIdx);

  const sentiment = sentimentCount > 10 ? "🟢 Bullish" : sentimentCount < 0 ? "🔴 Bearish" : "⚪ Neutral";

  const orderedCorps = CORPS.map((c) => states.find((s) => s.ticker === c.ticker)).filter(Boolean) as typeof states;

  const embed = new EmbedBuilder()
    .setColor(0x00FF88)
    .setAuthor({ name: `⚡  Neural Data Exchange  ·  Live Market  ·  ${BOT_NAME}` })
    .setDescription([
      `### ${idxArrow} GLITCH Index — ${idx.toLocaleString("en-US")}  \`${idxPct}\``,
      `${sentiment}  ·  Next price tick <t:${Math.floor(nextTickMs / 1000)}:R>`,
    ].join("\n"))
    .setFooter({ text: "Updates every minute  ·  /stocks view for analysis  ·  /stocks buy to trade" })
    .setTimestamp();

  for (const s of orderedCorps) {
    const meta    = getCorpMeta(s.ticker);
    const halted  = isHalted(s.haltedUntil);
    const arrow   = halted ? "🚧" : trendArrow(s.price, s.prevPrice);
    const pct     = pctStr(s.price, s.prevPrice);
    const price   = s.price.toLocaleString("en-US");
    const vol     = s.volume24h.toLocaleString("en-US");
    const chgLine = halted ? "**HALTED**" : `${arrow} \`${pct}\``;

    embed.addFields({
      name:   `${s.ticker} · ${meta.name}`,
      value:  `**${price}** coins\n${chgLine}  ·  VOL ${vol}`,
      inline: true,
    });
  }

  return embed;
}

// ─── Update the pinned live ticker message ────────────────────────────────────

export async function updateLiveTicker(client: Client, guildId: string): Promise<void> {
  try {
    const config = await getGuildConfig(guildId);
    if (!config.tickerChannelId) return;

    const states = await getStates(guildId);
    const sentMsg = await getSentimentCount(guildId);
    const nextTickMs = Date.now() + 2 * 60 * 60_000;
    const embed = buildTickerEmbed(states, sentMsg, nextTickMs);

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const ch = guild.channels.cache.get(config.tickerChannelId) as import("discord.js").TextChannel | undefined;
    if (!ch?.isTextBased()) return;

    if (config.tickerMessageId) {
      const existing = await ch.messages.fetch(config.tickerMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed] });
        return;
      }
    }

    // Message gone — send a fresh one and persist the new ID
    const msg = await ch.send({ embeds: [embed] });
    await updateGuildConfig(guildId, { tickerMessageId: msg.id });
  } catch (err) {
    logger.error({ err, guildId }, "Live ticker update failed");
  }
}

// ─── Scheduler entry point ────────────────────────────────────────────────────

export function startStockScheduler(client: Client): void {
  const TICK_MS         = 2 * 60 * 60_000;  // 2 hours
  const ORDER_MATCH_MS  = 10 * 60_000;       // 10 minutes
  const SENTIMENT_MS    = 5 * 60_000;        // 5 minutes
  const TICKER_MS       = 1 * 60_000;        // 1 minute

  // Flush sentiment buffer every 5 minutes
  setInterval(() => flushSentiment().catch(() => {}), SENTIMENT_MS);

  // Live ticker refresh every 5 minutes (countdown + order-fill price changes)
  setInterval(() => runTickerRefresh(client).catch(() => {}), TICKER_MS);

  // Order matching every 10 minutes (also refreshes ticker after fills)
  setInterval(() => runOrderMatcher(client).catch((err) => logger.error({ err }, "Order matcher failed")), ORDER_MATCH_MS);
  runOrderMatcher(client).catch(() => {});

  // Price tick every 2 hours
  setInterval(() => runTick(client).catch((err) => logger.error({ err }, "Stock tick failed")), TICK_MS);
  // Delay first tick by 60 seconds so the bot is fully online
  setTimeout(() => runTick(client).catch(() => {}), 60_000);

  logger.info("Stock scheduler started (2h tick, 10m order matcher, 1m ticker refresh)");
}
