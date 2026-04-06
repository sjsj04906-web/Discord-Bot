// Neural Data Exchange — Core Engine
// Corp constants, pricing math, NPC bots, order matching logic

// ─── Corp Metadata ────────────────────────────────────────────────────────────

export interface Corp {
  ticker:        string;
  name:          string;
  sector:        string;
  initPrice:     number; // coins
  floatShares:   number;
  liquidity:     number; // 1 (thin) – 5 (deep); affects price impact
  volatility:    number; // base σ in percent per tick (e.g. 20 = 20%)
  dividendYield: number; // basis points annual (0 = no dividend)
  beta:          number; // sensitivity to GLITCH Index moves
  color:         number; // embed colour
  emoji:         string;
}

export const CORPS: Corp[] = [
  {
    ticker: "ARSK", name: "Arasaka Corp",    sector: "surveillance",
    initPrice: 2500, floatShares: 500_000, liquidity: 5, volatility: 12,
    dividendYield: 200, beta: 0.7, color: 0xC41E3A, emoji: "🔴",
  },
  {
    ticker: "MLTC", name: "Militech",         sector: "weapons",
    initPrice: 1800, floatShares: 300_000, liquidity: 4, volatility: 16,
    dividendYield: 0, beta: 0.9, color: 0x888888, emoji: "⚫",
  },
  {
    ticker: "NTWT", name: "NetWatch",         sector: "cybersecurity",
    initPrice: 1200, floatShares: 200_000, liquidity: 3, volatility: 22,
    dividendYield: 0, beta: 1.0, color: 0x00B4D8, emoji: "🔵",
  },
  {
    ticker: "MAEL", name: "Maelstrom Data",   sector: "underground",
    initPrice: 400,  floatShares: 100_000, liquidity: 1, volatility: 45,
    dividendYield: 0, beta: 1.8, color: 0xFF4D00, emoji: "🟠",
  },
  {
    ticker: "KGTW", name: "Kang Tao",         sector: "weapons",
    initPrice: 950,  floatShares: 150_000, liquidity: 2, volatility: 28,
    dividendYield: 0, beta: 1.1, color: 0xFFD700, emoji: "🟡",
  },
  {
    ticker: "BRKN", name: "Broken Circuit",   sector: "consumer",
    initPrice: 120,  floatShares: 800_000, liquidity: 2, volatility: 30,
    dividendYield: 120, beta: 1.3, color: 0x9B59B6, emoji: "🟣",
  },
  {
    ticker: "ZENZ", name: "Zenith Neural",    sector: "biotech",
    initPrice: 3200, floatShares: 80_000,  liquidity: 3, volatility: 35,
    dividendYield: 80, beta: 1.2, color: 0x00FF88, emoji: "🟢",
  },
  {
    ticker: "VOID", name: "Voidrunner IX",    sector: "darkweb",
    initPrice: 280,  floatShares: 50_000,  liquidity: 1, volatility: 60,
    dividendYield: 0, beta: 2.2, color: 0x8B00FF, emoji: "⬛",
  },
];

export const TICKER_CHOICES = CORPS.map((c) => ({ name: `${c.ticker} — ${c.name}`, value: c.ticker }));

export function getCorpMeta(ticker: string): Corp {
  const c = CORPS.find((x) => x.ticker === ticker);
  if (!c) throw new Error(`Unknown ticker: ${ticker}`);
  return c;
}

// Sector correlation matrix — how much one sector event bleeds into another
const SECTOR_CORR: Record<string, Record<string, number>> = {
  weapons:       { weapons: 0.5, surveillance: 0.15, cybersecurity: 0.1, underground: 0.05, consumer: 0, biotech: 0, darkweb: 0 },
  surveillance:  { weapons: 0.15, surveillance: 0.5, cybersecurity: 0.3, underground: 0, consumer: 0, biotech: 0.1, darkweb: 0.05 },
  cybersecurity: { weapons: 0.1, surveillance: 0.3, cybersecurity: 0.5, underground: 0.2, consumer: 0, biotech: 0, darkweb: 0.15 },
  underground:   { weapons: 0.05, surveillance: 0, cybersecurity: 0.2, underground: 0.5, consumer: 0, biotech: 0, darkweb: 0.3 },
  consumer:      { weapons: 0, surveillance: 0, cybersecurity: 0, underground: 0, consumer: 0.5, biotech: 0.1, darkweb: 0 },
  biotech:       { weapons: 0, surveillance: 0.1, cybersecurity: 0, underground: 0, consumer: 0.1, biotech: 0.5, darkweb: 0 },
  darkweb:       { weapons: 0, surveillance: 0.05, cybersecurity: 0.15, underground: 0.3, consumer: 0, biotech: 0, darkweb: 0.5 },
};

export function sectorBleed(fromSector: string, toSector: string): number {
  return SECTOR_CORR[fromSector]?.[toSector] ?? 0;
}

// ─── Deterministic seeded RNG (mulberry32) ────────────────────────────────────
export function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function rng() { return Math.random(); }

// ─── Price arithmetic ─────────────────────────────────────────────────────────

/** Price impact of a trade: returns % change as a fraction (e.g. 0.02 = +2%). */
export function priceImpact(shares: number, price: number, liquidity: number, floatShares: number): number {
  const tradeValue = shares * price;
  const pool = liquidity * (floatShares / 10) * price; // liquidity pool depth in coins
  return Math.min(tradeValue / pool, 0.25); // cap at 25%
}

/** Apply drift + random walk to a price. Returns new price (integer, floor 1). */
export function applyDrift(
  price:      number,
  driftBias:  number, // -0.05 to +0.05 additive to random component
  volatility: number, // base volatility 0–1
  rngFn       = rng,
): number {
  const sigma = volatility * 0.01; // convert percent to fraction
  // Box-Muller normal sample
  const u1 = Math.max(1e-10, rngFn());
  const u2 = rngFn();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const change = driftBias + sigma * z;
  return Math.max(1, Math.round(price * (1 + change)));
}

/** Apply a forced price impact (basis points). */
export function applyImpactBps(price: number, impactBps: number): number {
  return Math.max(1, Math.round(price * (1 + impactBps / 10_000)));
}

// ─── GLITCH Index ─────────────────────────────────────────────────────────────

export interface PriceMap { [ticker: string]: number }

export function glitchIndex(currentPrices: PriceMap): number {
  // Weighted geometric mean of (currentPrice / initPrice), normalised to 10,000 base
  let logSum = 0;
  let weightSum = 0;
  for (const corp of CORPS) {
    const cur = currentPrices[corp.ticker];
    if (!cur) continue;
    const w = corp.initPrice * corp.floatShares; // market-cap weight at init
    logSum += w * Math.log(cur / corp.initPrice);
    weightSum += w;
  }
  if (weightSum === 0) return 10_000;
  return Math.round(10_000 * Math.exp(logSum / weightSum));
}

// ─── Sentiment → drift bias ───────────────────────────────────────────────────

/** Convert 6-hour message count to a drift bias (-0.02 to +0.02). */
export function sentimentDrift(messageCount: number): number {
  // 0 msgs = -2%, 50 msgs = neutral, 200+ msgs = +2%
  const normalized = Math.min(messageCount, 200) / 200;
  return (normalized - 0.25) * 0.08; // range -0.02 to +0.06
}

// ─── Black-Scholes pricing ────────────────────────────────────────────────────

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-(x * x) / 2);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  const cdf = 1 - d * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/**
 * Compute Black-Scholes option premium.
 * @param S     Spot price (coins)
 * @param K     Strike price (coins)
 * @param T     Time to expiry in years (ticks × 2h / 8760h)
 * @param r     Risk-free rate as fraction (e.g. 0.05)
 * @param sigma Implied volatility as fraction (e.g. 0.30)
 * @param isCall true = call, false = put
 */
export function blackScholesPrice(
  S: number, K: number, T: number,
  r: number, sigma: number, isCall: boolean,
): number {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (isCall) {
    return Math.max(0, S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2));
  }
  return Math.max(0, K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1));
}

/** Price an option for purchasing. Returns premium in coins per lot (100 share-equivalents). */
export function optionPremium(
  S: number,
  K: number,
  expiryTicks: number,
  baseRateBps: number,
  impliedVolBps: number,
  isCall: boolean,
): number {
  const T = (expiryTicks * 2) / 8_760; // 2h ticks → years
  const r = baseRateBps / 10_000;
  const sigma = impliedVolBps / 10_000;
  const raw = blackScholesPrice(S, K, T, r, sigma, isCall);
  return Math.max(1, Math.round(raw));
}

/** Compute option Greeks (delta, theta). */
export function optionGreeks(
  S: number, K: number, expiryTicks: number,
  baseRateBps: number, impliedVolBps: number, isCall: boolean,
): { delta: number; theta: number; iv: number } {
  const T = (expiryTicks * 2) / 8_760;
  const r = baseRateBps / 10_000;
  const sigma = impliedVolBps / 10_000;
  if (T <= 0) return { delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0), theta: 0, iv: sigma };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf_d1 = 0.3989423 * Math.exp(-(d1 * d1) / 2);
  const delta = isCall ? normalCDF(d1) : -normalCDF(-d1);
  const theta = isCall
    ? (-(S * pdf_d1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365
    : (-(S * pdf_d1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
  return { delta: Math.round(delta * 100) / 100, theta: Math.round(theta * 100) / 100, iv: Math.round(sigma * 10_000) };
}

// ─── Strike ladder for option chain display ───────────────────────────────────

export function strikeChain(currentPrice: number): number[] {
  const step = Math.max(10, Math.round(currentPrice * 0.05 / 10) * 10);
  const atm = Math.round(currentPrice / step) * step;
  return [-3, -2, -1, 0, 1, 2, 3].map((o) => atm + o * step);
}

// ─── Grid event generator ─────────────────────────────────────────────────────

interface GridEvent { headline: string; impactBps: number; eventType: string }

const GRID_EVENTS: Array<{ template: string; minImpact: number; maxImpact: number; positive: boolean }> = [
  { template: "{corp} signs exclusive government surveillance contract. Sector surging.", minImpact: 1500, maxImpact: 3500, positive: true },
  { template: "{corp} suffers catastrophic data breach. Systems compromised.", minImpact: -3500, maxImpact: -1500, positive: false },
  { template: "{corp} announces hostile acquisition of rival. Integration underway.", minImpact: 1000, maxImpact: 2500, positive: true },
  { template: "{corp} CEO arrested on corporate espionage charges.", minImpact: -4000, maxImpact: -2000, positive: false },
  { template: "{corp} neural implant tech achieves breakthrough approval.", minImpact: 2000, maxImpact: 4500, positive: true },
  { template: "{corp} supply chain collapse detected in eastern manufacturing nodes.", minImpact: -2500, maxImpact: -1000, positive: false },
  { template: "{corp} wins landmark AI enforcement contract from NetWatch.", minImpact: 800, maxImpact: 2000, positive: true },
  { template: "{corp} dark-net whistleblower leaks internal financials.", minImpact: -3000, maxImpact: -1500, positive: false },
  { template: "{corp} announces record quarterly earnings, beating all estimates.", minImpact: 1500, maxImpact: 3000, positive: true },
  { template: "{corp} quantum network nodes seized in corp raid. Routes disrupted.", minImpact: -3500, maxImpact: -1500, positive: false },
  { template: "{corp} discovers massive lithium deposit in restricted zone.", minImpact: 1200, maxImpact: 2800, positive: true },
  { template: "{corp} faces class-action lawsuit from 40,000 implant users.", minImpact: -2000, maxImpact: -800, positive: false },
];

export function generateGridEvent(corpName: string, seed?: number): GridEvent {
  const rngFn = seed !== undefined ? seededRng(seed) : rng;
  const idx = Math.floor(rngFn() * GRID_EVENTS.length);
  const ev = GRID_EVENTS[idx]!;
  const range = Math.abs(ev.maxImpact - ev.minImpact);
  const impact = ev.minImpact + Math.floor(rngFn() * range);
  return {
    headline: ev.template.replace("{corp}", corpName),
    impactBps: impact,
    eventType: "grid_event",
  };
}

export function generateFlashCrash(corpName: string): GridEvent {
  const impactBps = -(2500 + Math.floor(rng() * 2000)); // -25% to -45%
  return {
    headline: `⚡ FLASH CRASH — Algorithmic cascade detected in ${corpName}. MOMENTUM-9 rogue dump in progress.`,
    impactBps,
    eventType: "flash_crash",
  };
}

// ─── NPC Bot signals ──────────────────────────────────────────────────────────

export interface BotSignal {
  action: "buy" | "sell" | "none";
  shares: number;
  reason: string;
}

/** ARBITRON: mean-reversion bot. Returns desired action vs 5-tick MA price. */
export function arbitronSignal(
  currentPrice: number,
  maPrice: number, // 5-tick moving average
  budget: number,
): BotSignal {
  if (maPrice <= 0) return { action: "none", shares: 0, reason: "no MA" };
  const deviation = (currentPrice - maPrice) / maPrice;
  if (deviation < -0.12) {
    // Oversold — buy
    const maxShares = Math.floor(budget * 0.3 / currentPrice);
    const shares = Math.max(1, Math.min(maxShares, 500));
    return { action: "buy", shares, reason: `oversold ${(deviation * 100).toFixed(1)}% vs MA` };
  }
  if (deviation > 0.12) {
    // Overbought — sell
    const shares = Math.min(300, Math.floor(Math.random() * 200 + 50));
    return { action: "sell", shares, reason: `overbought ${(deviation * 100).toFixed(1)}% vs MA` };
  }
  return { action: "none", shares: 0, reason: "within band" };
}

/** MOMENTUM-9: trend-following bot. Needs last 2 tick directions. */
export function momentum9Signal(
  tickHistory: number[], // last 3 prices, newest last
  budget: number,
  currentPrice: number,
): BotSignal {
  if (tickHistory.length < 2) return { action: "none", shares: 0, reason: "insufficient history" };
  const prev2 = tickHistory[tickHistory.length - 2]!;
  const prev1 = tickHistory[tickHistory.length - 1]!;
  const up2 = prev1 > prev2;
  const up1 = currentPrice > prev1;
  if (up2 && up1) {
    const shares = Math.max(1, Math.min(400, Math.floor(budget * 0.25 / currentPrice)));
    return { action: "buy", shares, reason: "2-tick uptrend" };
  }
  if (!up2 && !up1) {
    const shares = Math.min(300, Math.floor(Math.random() * 150 + 50));
    return { action: "sell", shares, reason: "2-tick downtrend" };
  }
  return { action: "none", shares: 0, reason: "mixed signals" };
}

/** THE GHOST: market maker — just provides liquidity, no directional signal. */
export function ghostSpread(currentPrice: number): { bid: number; ask: number; spread: number } {
  const spread = Math.max(2, Math.round(currentPrice * 0.02));
  return {
    bid: currentPrice - spread,
    ask: currentPrice + spread,
    spread,
  };
}

// ─── Portfolio analytics ──────────────────────────────────────────────────────

export interface Holding { ticker: string; shares: number; avgCost: number }

export function portfolioValue(holdings: Holding[], prices: PriceMap): number {
  return holdings.reduce((sum, h) => sum + h.shares * (prices[h.ticker] ?? h.avgCost), 0);
}

export function portfolioBeta(holdings: Holding[], prices: PriceMap): number {
  const total = portfolioValue(holdings, prices);
  if (total === 0) return 0;
  let beta = 0;
  for (const h of holdings) {
    const corp = CORPS.find((c) => c.ticker === h.ticker);
    if (!corp) continue;
    const weight = (h.shares * (prices[h.ticker] ?? h.avgCost)) / total;
    beta += weight * corp.beta;
  }
  return Math.round(beta * 100) / 100;
}

export function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return Math.round((mean / stdDev) * 100) / 100;
}

// ─── Spark-line renderer (Unicode block chars) ────────────────────────────────

export function sparkline(prices: number[]): string {
  if (prices.length < 2) return "—";
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices.map((p) => blocks[Math.min(7, Math.floor(((p - min) / range) * 8))]!).join("");
}

// ─── Trend arrow ──────────────────────────────────────────────────────────────

export function trendArrow(current: number, prev: number): string {
  const pct = (current - prev) / prev;
  if (pct > 0.05)  return "🚀";
  if (pct > 0.01)  return "📈";
  if (pct > 0)     return "↗";
  if (pct < -0.05) return "💥";
  if (pct < -0.01) return "📉";
  if (pct < 0)     return "↘";
  return "→";
}

export function pctStr(current: number, prev: number): string {
  const pct = ((current - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

// ─── Market status helpers ────────────────────────────────────────────────────

export function isHalted(haltedUntil: Date | null): boolean {
  if (!haltedUntil) return false;
  return new Date() < haltedUntil;
}

export function circuitBreakerThreshold(volatility: number): number {
  // Higher-volatility corps get a wider circuit breaker
  return Math.min(40, Math.max(25, 25 + (volatility - 20) * 0.25));
}

// ─── Bond yields ──────────────────────────────────────────────────────────────

export function corpBondYield(baseRateBps: number): number {
  return Math.round(baseRateBps * 0.8 + 200); // below-market (safe)
}

export function junkBondYield(baseRateBps: number): number {
  return Math.round(baseRateBps * 1.5 + 500); // above-market (risky)
}

// ─── Dark-pool fill time ──────────────────────────────────────────────────────

export function darkPoolFillTime(): Date {
  return new Date(Date.now() + 30 * 60_000); // 30 minutes
}

// ─── Takeover bid price ───────────────────────────────────────────────────────

export function takeoverBidPrice(currentPrice: number): number {
  return Math.round(currentPrice * 1.15); // 15% premium
}
