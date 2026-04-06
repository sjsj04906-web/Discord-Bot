// Neural Data Exchange — /stocks command
import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  type ChatInputCommandInteraction, PermissionFlagsBits,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import {
  CORPS, getCorpMeta, TICKER_CHOICES, glitchIndex, sparkline, trendArrow,
  pctStr, isHalted, optionPremium, optionGreeks, strikeChain,
  portfolioValue, portfolioBeta, sharpeRatio, ghostSpread,
  takeoverBidPrice, darkPoolFillTime, corpBondYield, junkBondYield,
} from "../stockEngine.js";
import {
  initMarket, getStates, getState, getHolding, getHoldings,
  upsertHolding, totalSharesHeld,
  addOrder, getUserOrders, cancelOrder,
  getShort, getShorts, openShort, closeShort,
  getUserOptions, openOption, setOptionStatus,
  getUserBonds, buyBond,
  getRecentEvents, getUpcomingEarnings,
  getOpenIpos, getUserIpoAlloc, addIpoAlloc, getIpoTotalAllocated,
  getNeuralBankRate, setNeuralBankRate,
  getActiveTakeover, launchTakeover,
  getBotStates, getPriceHistory,
  bufferSentiment,
  scheduleEarnings,
} from "../stockDb.js";
import { executeBuy, executeSell } from "../stockScheduler.js";
import { getBalance, deductBalance, addBalance, getGuildConfig } from "../db.js";

async function walletBalance(guildId: string, userId: string): Promise<number> {
  return (await getBalance(guildId, userId)).balance;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName("stocks")
  .setDescription("📈  Neural Data Exchange — cyberpunk stock market simulation")

  // ── View live market board ─────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("view").setDescription("Live market board — all 8 corps, GLITCH Index, sentiment"))

  // ── Order book depth ───────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("book")
    .setDescription("Order book depth chart for a ticker")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES)))

  // ── Buy shares ─────────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("buy")
    .setDescription("Buy shares (market order, or limit/dark pool)")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES))
    .addIntegerOption((o) => o.setName("shares").setDescription("Number of shares").setRequired(true).setMinValue(1).setMaxValue(10_000))
    .addIntegerOption((o) => o.setName("limit").setDescription("Limit price — queue order until price ≤ this"))
    .addBooleanOption((o) => o.setName("leverage").setDescription("2× leverage (50% collateral, daily borrow fee, liquidation risk)"))
    .addBooleanOption((o) => o.setName("dark").setDescription("Route via dark pool (30-min fill, no market impact, 0.5% fee)")))

  // ── Sell shares ────────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("sell")
    .setDescription("Sell shares (market order, limit, stop-loss, or dark pool)")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES))
    .addIntegerOption((o) => o.setName("shares").setDescription("Number of shares").setRequired(true).setMinValue(1).setMaxValue(10_000))
    .addIntegerOption((o) => o.setName("limit").setDescription("Limit price — queue until price ≥ this"))
    .addIntegerOption((o) => o.setName("stop").setDescription("Stop-loss price — auto-sell if price drops here"))
    .addBooleanOption((o) => o.setName("dark").setDescription("Route via dark pool (30-min fill, no market impact, 0.5% fee)")))

  // ── Short selling ──────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("short")
    .setDescription("Open a short position — profit if price falls")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES))
    .addIntegerOption((o) => o.setName("shares").setDescription("Shares to short").setRequired(true).setMinValue(1).setMaxValue(5_000)))

  // ── Cover short ────────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("cover")
    .setDescription("Close your short position in a ticker")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES)))

  // ── Open orders ────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("orders").setDescription("View your open limit, stop-loss, and dark pool orders"))

  // ── Cancel order ───────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("cancel")
    .setDescription("Cancel an open order by ID")
    .addIntegerOption((o) => o.setName("id").setDescription("Order ID (from /stocks orders)").setRequired(true)))

  // ── Portfolio ──────────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("portfolio")
    .setDescription("View your holdings, P&L, and open positions")
    .addUserOption((o) => o.setName("user").setDescription("View another user's portfolio")))

  // ── Risk dashboard ─────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("risk").setDescription("Portfolio risk metrics — beta, Sharpe, margin exposure"))

  // ── Price history ──────────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("history")
    .setDescription("Price sparkline and last 10 tick history for a corp")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES)))

  // ── News feed ──────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("news").setDescription("Last 10 market events (grid events, crashes, earnings, IPOs)"))

  // ── Earnings calendar ──────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("earnings").setDescription("Upcoming earnings reports with analyst estimates"))

  // ── NPC bot dashboard ─────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("bots").setDescription("View NPC algorithmic trader positions and budgets"))

  // ── Rich list ──────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName("rich").setDescription("Top traders by total portfolio value (wallet + holdings)"))

  // ── Hostile takeover ──────────────────────────────────────────────────────
  .addSubcommand((s) => s
    .setName("takeover")
    .setDescription("Launch a hostile takeover (requires ≥20% of float)")
    .addStringOption((o) => o.setName("ticker").setDescription("Corp to raid").setRequired(true).addChoices(...TICKER_CHOICES)))

  // ── Option subcommand group ────────────────────────────────────────────────
  .addSubcommandGroup((g) => g
    .setName("option")
    .setDescription("Options trading — calls and puts with Black-Scholes pricing")
    .addSubcommand((s) => s
      .setName("chain")
      .setDescription("View available strike prices and premiums for a ticker")
      .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES)))
    .addSubcommand((s) => s
      .setName("buy")
      .setDescription("Buy a call or put option contract")
      .addStringOption((o) => o.setName("ticker").setDescription("Corp ticker").setRequired(true).addChoices(...TICKER_CHOICES))
      .addStringOption((o) => o.setName("type").setDescription("call or put").setRequired(true).addChoices({ name: "Call (profit if price rises)", value: "call" }, { name: "Put (profit if price falls)", value: "put" }))
      .addIntegerOption((o) => o.setName("strike").setDescription("Strike price in coins").setRequired(true).setMinValue(1))
      .addIntegerOption((o) => o.setName("expiry").setDescription("Ticks until expiry (1 tick = 2 hours)").setRequired(true).setMinValue(1).setMaxValue(84))
      .addIntegerOption((o) => o.setName("lots").setDescription("Number of lots (default 1)").setMinValue(1).setMaxValue(50)))
    .addSubcommand((s) => s
      .setName("sell")
      .setDescription("Close / exercise an option contract")
      .addIntegerOption((o) => o.setName("id").setDescription("Contract ID (from /stocks option list)").setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("Your open option contracts")))

  // ── Bond subcommand group ──────────────────────────────────────────────────
  .addSubcommandGroup((g) => g
    .setName("bond")
    .setDescription("Fixed income — corp and junk bonds")
    .addSubcommand((s) => s
      .setName("buy")
      .setDescription("Purchase a bond")
      .addStringOption((o) => o.setName("type").setDescription("Bond type").setRequired(true).addChoices({ name: "Corp bond (ARSK-backed, low risk)", value: "corp" }, { name: "Junk bond (high yield, 8% default risk)", value: "junk" }))
      .addIntegerOption((o) => o.setName("amount").setDescription("Principal amount in coins").setRequired(true).setMinValue(100))
      .addIntegerOption((o) => o.setName("maturity").setDescription("Days until maturity").setRequired(true).addChoices({ name: "3 days", value: 3 }, { name: "7 days", value: 7 }, { name: "14 days", value: 14 })))
    .addSubcommand((s) => s.setName("list").setDescription("Your active bond positions")))

  // ── IPO subcommand group ───────────────────────────────────────────────────
  .addSubcommandGroup((g) => g
    .setName("ipo")
    .setDescription("Initial Public Offerings — new corp listings")
    .addSubcommand((s) => s.setName("list").setDescription("View upcoming and open IPOs"))
    .addSubcommand((s) => s
      .setName("buy")
      .setDescription("Participate in an open IPO")
      .addIntegerOption((o) => o.setName("id").setDescription("IPO ID (from /stocks ipo list)").setRequired(true))
      .addIntegerOption((o) => o.setName("shares").setDescription("Shares to request").setRequired(true).setMinValue(1))))

  // ── Admin subcommand group ─────────────────────────────────────────────────
  .addSubcommandGroup((g) => g
    .setName("admin")
    .setDescription("Admin controls — Neural Bank and market management")
    .addSubcommand((s) => s
      .setName("rate")
      .setDescription("View or set the Neural Bank base interest rate")
      .addIntegerOption((o) => o.setName("set").setDescription("New rate in basis points (50–2000). Omit to just view.").setMinValue(50).setMaxValue(2_000)))
    .addSubcommand((s) => s
      .setName("earnings")
      .setDescription("Schedule earnings reports for all corps (admin only)")));

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command only works in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;
  await initMarket(guildId);

  const group = interaction.options.getSubcommandGroup(false);
  const sub   = interaction.options.getSubcommand();

  if (group === "option") {
    if (sub === "chain")  return handleOptionChain(interaction, guildId);
    if (sub === "buy")    return handleOptionBuy(interaction, guildId, userId);
    if (sub === "sell")   return handleOptionSell(interaction, guildId, userId);
    if (sub === "list")   return handleOptionList(interaction, guildId, userId);
    return;
  }
  if (group === "bond") {
    if (sub === "buy")  return handleBondBuy(interaction, guildId, userId);
    if (sub === "list") return handleBondList(interaction, guildId, userId);
    return;
  }
  if (group === "ipo") {
    if (sub === "list") return handleIpoList(interaction, guildId);
    if (sub === "buy")  return handleIpoBuy(interaction, guildId, userId);
    return;
  }
  if (group === "admin") {
    if (sub === "rate")     return handleAdminRate(interaction, guildId, userId);
    if (sub === "earnings") return handleAdminEarnings(interaction, guildId, userId);
    return;
  }

  switch (sub) {
    case "view":      return handleView(interaction, guildId);
    case "book":      return handleBook(interaction, guildId);
    case "buy":       return handleBuy(interaction, guildId, userId);
    case "sell":      return handleSell(interaction, guildId, userId);
    case "short":     return handleShort(interaction, guildId, userId);
    case "cover":     return handleCover(interaction, guildId, userId);
    case "orders":    return handleOrders(interaction, guildId, userId);
    case "cancel":    return handleCancel(interaction, guildId, userId);
    case "portfolio": return handlePortfolio(interaction, guildId, userId);
    case "risk":      return handleRisk(interaction, guildId, userId);
    case "history":   return handleHistory(interaction, guildId);
    case "news":      return handleNews(interaction, guildId);
    case "earnings":  return handleEarnings(interaction, guildId);
    case "bots":      return handleBots(interaction, guildId);
    case "rich":      return handleRich(interaction, guildId, userId);
    case "takeover":  return handleTakeover(interaction, guildId, userId);
  }
}

// ─── /stocks view ─────────────────────────────────────────────────────────────

async function handleView(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const states = await getStates(guildId);
  const baseRate = await getNeuralBankRate(guildId);

  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;
  const idx = glitchIndex(priceMap);

  const rows = states.sort((a, b) => a.ticker.localeCompare(b.ticker)).map((s) => {
    const corp = getCorpMeta(s.ticker);
    const halted = isHalted(s.haltedUntil);
    const arrow = halted ? "🚧" : trendArrow(s.price, s.prevPrice);
    const chg   = pctStr(s.price, s.prevPrice);
    return `${corp.emoji} **${s.ticker}**  ${halted ? "~~" : ""}${s.price.toLocaleString()}${halted ? "~~ HALTED" : ""}  ${arrow} ${chg}  vol ${s.volume24h.toLocaleString()}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x00B4D8)
    .setAuthor({ name: `📈  Neural Data Exchange  ·  ${BOT_NAME}` })
    .setTitle("GLITCH Index  ·  Live Market Board")
    .setDescription([
      `\`\`\`GLITCH Index: ${idx.toLocaleString()} pts\`\`\``,
      rows.join("\n"),
      "",
      SEP,
      `🏦 Neural Bank rate: **${(baseRate / 100).toFixed(2)}%** · Data refreshed <t:${Math.floor(Date.now() / 1000)}:R>`,
    ].join("\n"))
    .setFooter({ text: "Price impact active · 2h tick · /stocks history [ticker] for chart" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks book ─────────────────────────────────────────────────────────────

async function handleBook(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const ticker = interaction.options.getString("ticker", true);
  const state  = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp data not found."); return; }
  const corp = getCorpMeta(ticker);
  const spread = ghostSpread(state.price);

  // Fetch open limit orders for this ticker
  const orders = await import("../stockDb.js").then((m) => m.getOpenOrders(guildId));
  const buys  = orders.filter((o) => o.ticker === ticker && o.side === "buy"  && o.limitPrice).sort((a, b) => (b.limitPrice ?? 0) - (a.limitPrice ?? 0)).slice(0, 5);
  const sells = orders.filter((o) => o.ticker === ticker && o.side === "sell" && o.limitPrice).sort((a, b) => (a.limitPrice ?? 0) - (b.limitPrice ?? 0)).slice(0, 5);

  const fmtLevel = (orders2: typeof buys, side: "bid" | "ask") =>
    orders2.length > 0
      ? orders2.map((o) => `${side === "bid" ? "🟢" : "🔴"} ${(o.limitPrice ?? 0).toLocaleString().padStart(8)}  ×${o.shares.toLocaleString()}`).join("\n")
      : `*(${side === "bid" ? "no bids" : "no asks"})*`;

  const embed = new EmbedBuilder()
    .setColor(corp.color)
    .setAuthor({ name: `📖  Order Book  ·  ${ticker}  ·  ${BOT_NAME}` })
    .addFields(
      { name: `${corp.emoji} ${corp.name}  (${corp.sector})`, value: `Price: **${state.price.toLocaleString()}** | ${isHalted(state.haltedUntil) ? "🚧 HALTED" : `Spread: ${spread.spread.toLocaleString()}`}`, inline: false },
      { name: "🔴  Asks (sell orders)",  value: fmtLevel(sells, "ask"), inline: true },
      { name: "🟢  Bids (buy orders)",   value: fmtLevel(buys, "bid"),  inline: true },
    )
    .setFooter({ text: `GHOST market-maker bid ${spread.bid.toLocaleString()} / ask ${spread.ask.toLocaleString()}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks buy ──────────────────────────────────────────────────────────────

async function handleBuy(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker   = interaction.options.getString("ticker", true);
  const shares   = interaction.options.getInteger("shares", true);
  const limit    = interaction.options.getInteger("limit", false);
  const leverage = interaction.options.getBoolean("leverage", false) ?? false;
  const dark     = interaction.options.getBoolean("dark", false) ?? false;

  const state = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }
  if (isHalted(state.haltedUntil)) { await interaction.editReply("🚧 Trading halted on this corp. Try again later."); return; }

  const corp = getCorpMeta(ticker);
  const price = limit ?? state.price;
  const totalCost = leverage ? Math.ceil((shares * price) / 2) : shares * price;
  const balance = await walletBalance(guildId, userId);

  if (balance < totalCost) {
    await interaction.editReply(`❌ Insufficient funds. You need **${totalCost.toLocaleString()}** coins (you have ${balance.toLocaleString()}).`);
    return;
  }

  // Check order count
  const existing = await getUserOrders(guildId, userId);
  if ((limit || dark) && existing.length >= 5) {
    await interaction.editReply("❌ You have 5 open orders. Cancel one before placing another.");
    return;
  }

  await deductBalance(guildId, userId, totalCost);

  if (dark) {
    const fillsAt = darkPoolFillTime();
    await addOrder(guildId, userId, ticker, "buy", "dark", shares, undefined, leverage, fillsAt);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2C2C2C)
        .setAuthor({ name: `🌑  Dark Pool Order Queued  ·  ${BOT_NAME}` })
        .setDescription(`**BUY ${shares} ${ticker}** routed to dark pool.\nFills at mid-price in ~30 minutes. Fee: **0.5%** of fill value.\nCollateral locked: **${totalCost.toLocaleString()}** coins.`)
        .setFooter({ text: `Fills at ${fillsAt.toLocaleString()}` })
        .setTimestamp()],
    });
    return;
  }

  if (limit) {
    await addOrder(guildId, userId, ticker, "buy", "limit", shares, limit, leverage);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(THEME.economy)
        .setAuthor({ name: `📋  Limit Buy Queued  ·  ${BOT_NAME}` })
        .setDescription(`**BUY ${shares} ${ticker}** @ **${limit.toLocaleString()}** or better.\n${leverage ? "⚡ 2× Leverage active" : ""}`)
        .setTimestamp()],
    });
    return;
  }

  // Market buy
  await executeBuy(guildId, userId, ticker, shares, state.price, leverage);
  const newState = await getState(guildId, ticker);
  const filled   = state.price;

  const embed = new EmbedBuilder()
    .setColor(corp.color)
    .setAuthor({ name: `✅  Market Buy Filled  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Corp",     value: `${corp.emoji} **${ticker}** — ${corp.name}`, inline: true },
      { name: "Shares",   value: shares.toLocaleString(), inline: true },
      { name: "Price",    value: `${filled.toLocaleString()} coins`, inline: true },
      { name: "Total",    value: `${(shares * filled).toLocaleString()} coins`, inline: true },
      { name: "New Mkt",  value: `${(newState?.price ?? filled).toLocaleString()} coins`, inline: true },
      { name: "Impact",   value: `${pctStr(newState?.price ?? filled, filled)}`, inline: true },
    )
    .setFooter({ text: leverage ? "⚡ 2× Leverage applied" : "Market order · price impact applied" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks sell ─────────────────────────────────────────────────────────────

async function handleSell(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker = interaction.options.getString("ticker", true);
  const shares = interaction.options.getInteger("shares", true);
  const limit  = interaction.options.getInteger("limit", false);
  const stop   = interaction.options.getInteger("stop", false);
  const dark   = interaction.options.getBoolean("dark", false) ?? false;

  const holding = await getHolding(guildId, userId, ticker);
  if (!holding || holding.shares < shares) {
    await interaction.editReply(`❌ You only have **${holding?.shares ?? 0} ${ticker}** shares.`);
    return;
  }

  const state = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }
  if (isHalted(state.haltedUntil)) { await interaction.editReply("🚧 Trading halted on this corp."); return; }

  const corp = getCorpMeta(ticker);
  const existing = await getUserOrders(guildId, userId);
  if ((limit || stop || dark) && existing.length >= 5) {
    await interaction.editReply("❌ You have 5 open orders. Cancel one first.");
    return;
  }

  if (dark) {
    const fillsAt = darkPoolFillTime();
    await addOrder(guildId, userId, ticker, "sell", "dark", shares, undefined, false, fillsAt);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2C2C2C)
        .setAuthor({ name: `🌑  Dark Pool Sell Queued  ·  ${BOT_NAME}` })
        .setDescription(`**SELL ${shares} ${ticker}** routed to dark pool. Fills at mid-price in ~30 minutes.`)
        .setTimestamp()],
    });
    return;
  }

  if (stop) {
    await addOrder(guildId, userId, ticker, "sell", "stop", shares, stop);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(THEME.warn)
        .setAuthor({ name: `🛑  Stop-Loss Set  ·  ${BOT_NAME}` })
        .setDescription(`**SELL ${shares} ${ticker}** triggers if price drops to **${stop.toLocaleString()}**`)
        .setTimestamp()],
    });
    return;
  }

  if (limit) {
    await addOrder(guildId, userId, ticker, "sell", "limit", shares, limit);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(THEME.economy)
        .setAuthor({ name: `📋  Limit Sell Queued  ·  ${BOT_NAME}` })
        .setDescription(`**SELL ${shares} ${ticker}** @ **${limit.toLocaleString()}** or better.`)
        .setTimestamp()],
    });
    return;
  }

  // Market sell
  const proceeds = await executeSell(guildId, userId, ticker, shares, state.price);
  const pl = (state.price - holding.avgCost) * shares;

  const embed = new EmbedBuilder()
    .setColor(pl >= 0 ? THEME.success : THEME.danger)
    .setAuthor({ name: `✅  Market Sell Filled  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Corp",      value: `${corp.emoji} **${ticker}**`, inline: true },
      { name: "Shares",    value: shares.toLocaleString(), inline: true },
      { name: "Price",     value: `${state.price.toLocaleString()} coins`, inline: true },
      { name: "Proceeds",  value: `${proceeds.toLocaleString()} coins`, inline: true },
      { name: "Avg Cost",  value: `${holding.avgCost.toLocaleString()} coins`, inline: true },
      { name: "P&L",       value: `${pl >= 0 ? "+" : ""}${pl.toLocaleString()} coins`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks short ────────────────────────────────────────────────────────────

async function handleShort(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker = interaction.options.getString("ticker", true);
  const shares = interaction.options.getInteger("shares", true);

  const state = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }
  if (isHalted(state.haltedUntil)) { await interaction.editReply("🚧 Trading halted."); return; }

  const existing = await getShort(guildId, userId, ticker);
  if (existing) { await interaction.editReply(`❌ You already have an open short on **${ticker}**. Cover it first.`); return; }

  const collateral = Math.ceil(shares * state.price * 1.5); // 150% collateral
  const balance = await walletBalance(guildId, userId);
  if (balance < collateral) {
    await interaction.editReply(`❌ You need **${collateral.toLocaleString()}** coins as collateral (150% of position). You have ${balance.toLocaleString()}.`);
    return;
  }

  await deductBalance(guildId, userId, collateral);
  const shortId = await openShort(guildId, userId, ticker, shares, state.price, collateral);
  const corp = getCorpMeta(ticker);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF4D00)
      .setAuthor({ name: `📉  Short Position Opened  ·  ${BOT_NAME}` })
      .addFields(
        { name: "Corp",        value: `${corp.emoji} **${ticker}** — ${corp.name}`, inline: true },
        { name: "Shares",      value: shares.toLocaleString(), inline: true },
        { name: "Entry",       value: `${state.price.toLocaleString()} coins`, inline: true },
        { name: "Collateral",  value: `${collateral.toLocaleString()} coins`, inline: true },
        { name: "Daily Fee",   value: "0.5% of position value", inline: true },
        { name: "Liquidation", value: "Collateral < 20% of position", inline: true },
      )
      .setDescription(`📋 Short ID: \`${shortId}\`\nYou profit if **${ticker}** price falls below **${state.price.toLocaleString()}**.`)
      .setTimestamp()],
  });
}

// ─── /stocks cover ────────────────────────────────────────────────────────────

async function handleCover(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker = interaction.options.getString("ticker", true);
  const short  = await getShort(guildId, userId, ticker);
  if (!short) { await interaction.editReply(`❌ You have no open short on **${ticker}**.`); return; }

  const state = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }

  const profit = short.shares * (short.entryPrice - state.price);
  const payout = Math.max(0, short.collateral + profit);
  await addBalance(guildId, userId, payout);
  await closeShort(short.id);

  const embed = new EmbedBuilder()
    .setColor(profit >= 0 ? THEME.success : THEME.danger)
    .setAuthor({ name: `✅  Short Covered  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Corp",          value: ticker, inline: true },
      { name: "Shares",        value: short.shares.toLocaleString(), inline: true },
      { name: "Entry Price",   value: `${short.entryPrice.toLocaleString()} coins`, inline: true },
      { name: "Cover Price",   value: `${state.price.toLocaleString()} coins`, inline: true },
      { name: "Gross P&L",     value: `${profit >= 0 ? "+" : ""}${profit.toLocaleString()} coins`, inline: true },
      { name: "Collateral",    value: `${short.collateral.toLocaleString()} coins`, inline: true },
      { name: "Total Payout",  value: `**${payout.toLocaleString()} coins**`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks orders ───────────────────────────────────────────────────────────

async function handleOrders(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const orders = await getUserOrders(guildId, userId);
  if (!orders.length) { await interaction.editReply("You have no open orders."); return; }

  const lines = orders.map((o) => {
    const type = o.orderType === "dark" ? "🌑 DARK" : o.orderType === "stop" ? "🛑 STOP" : "📋 LIMIT";
    const price = o.limitPrice ? `@ ${o.limitPrice.toLocaleString()}` : "(mid)";
    return `\`${o.id}\` ${type} ${o.side.toUpperCase()} **${o.shares} ${o.ticker}** ${price}`;
  });

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `📋  Open Orders  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Use /stocks cancel [id] to cancel an order" })
      .setTimestamp()],
  });
}

// ─── /stocks cancel ───────────────────────────────────────────────────────────

async function handleCancel(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.options.getInteger("id", true);
  const ok = await cancelOrder(id, guildId, userId);
  if (!ok) { await interaction.editReply("❌ Order not found or not owned by you."); return; }
  await interaction.editReply(`✅ Order \`${id}\` cancelled. Funds returned to your wallet.`);
}

// ─── /stocks portfolio ────────────────────────────────────────────────────────

async function handlePortfolio(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", false);
  const targetId   = targetUser?.id ?? userId;

  const holdings = await getHoldings(guildId, targetId);
  const shorts   = await getShorts(guildId, targetId);
  const options  = await getUserOptions(guildId, targetId);
  const bonds    = await getUserBonds(guildId, targetId);
  const states   = await getStates(guildId);

  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;

  const longLines = holdings.length > 0
    ? holdings.map((h) => {
        const cur = priceMap[h.ticker] ?? h.avgCost;
        const pl  = (cur - h.avgCost) * h.shares;
        const pct = ((cur - h.avgCost) / h.avgCost * 100).toFixed(1);
        const corp = getCorpMeta(h.ticker);
        return `${corp.emoji} **${h.ticker}** ×${h.shares}  avg ${h.avgCost.toLocaleString()} → cur ${cur.toLocaleString()}  P&L: ${pl >= 0 ? "+" : ""}${pl.toLocaleString()} (${pl >= 0 ? "+" : ""}${pct}%)`;
      }).join("\n")
    : "*(no long positions)*";

  const shortLines = shorts.length > 0
    ? shorts.map((s) => {
        const cur = priceMap[s.ticker] ?? s.entryPrice;
        const pl  = s.shares * (s.entryPrice - cur);
        return `📉 **${s.ticker}** ×${s.shares} short  entry ${s.entryPrice.toLocaleString()} → cur ${cur.toLocaleString()}  P&L: ${pl >= 0 ? "+" : ""}${pl.toLocaleString()}  collateral ${s.collateral.toLocaleString()}`;
      }).join("\n")
    : "*(no short positions)*";

  const optLines = options.length > 0
    ? options.map((o) => `\`${o.id}\` ${o.optionType.toUpperCase()} **${o.ticker}** strike ${o.strike.toLocaleString()} × ${o.lots} lot${o.lots > 1 ? "s" : ""} — expires <t:${Math.floor(o.expiresAt.getTime() / 1000)}:R>`).join("\n")
    : "*(no options)*";

  const bondLines = bonds.length > 0
    ? bonds.map((b) => `📄 ${b.bondType.toUpperCase()} bond ${Number(b.principal).toLocaleString()} @ ${(b.yieldBps / 100).toFixed(2)}% — matures <t:${Math.floor(b.maturesAt.getTime() / 1000)}:R>`).join("\n")
    : "*(no bonds)*";

  const totalVal = portfolioValue(holdings, priceMap);
  const balance  = await walletBalance(guildId, targetId);

  const embed = new EmbedBuilder()
    .setColor(THEME.economy)
    .setAuthor({ name: `💼  Portfolio  ·  ${targetUser?.tag ?? interaction.user.tag}  ·  ${BOT_NAME}` })
    .addFields(
      { name: "📊 Long Positions", value: longLines.slice(0, 1024), inline: false },
      { name: "📉 Short Positions", value: shortLines.slice(0, 1024), inline: false },
      { name: "⚡ Options", value: optLines.slice(0, 1024), inline: false },
      { name: "📄 Bonds", value: bondLines.slice(0, 512), inline: false },
    )
    .setFooter({ text: `Holdings value: ${totalVal.toLocaleString()} coins  ·  Wallet: ${balance.toLocaleString()} coins  ·  Net: ${(totalVal + balance).toLocaleString()} coins` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks risk ─────────────────────────────────────────────────────────────

async function handleRisk(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const holdings = await getHoldings(guildId, userId);
  const shorts   = await getShorts(guildId, userId);
  const states   = await getStates(guildId);
  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;

  const beta = portfolioBeta(holdings, priceMap);
  const totalLong = portfolioValue(holdings, priceMap);

  // Compute simple return series (just use P&L ratios)
  const returns = holdings.map((h) => {
    const cur = priceMap[h.ticker] ?? h.avgCost;
    return (cur - h.avgCost) / h.avgCost;
  });
  const sharpe = sharpeRatio(returns);

  const marginExposure = shorts.reduce((s, sh) => s + sh.shares * (priceMap[sh.ticker] ?? sh.entryPrice), 0);
  const collateralTotal = shorts.reduce((s, sh) => s + sh.collateral, 0);
  const marginUtil = marginExposure > 0 ? ((marginExposure - collateralTotal) / marginExposure * 100).toFixed(1) : "0.0";

  const concentration = holdings.map((h) => {
    const val = h.shares * (priceMap[h.ticker] ?? h.avgCost);
    return { ticker: h.ticker, pct: totalLong > 0 ? ((val / totalLong) * 100).toFixed(1) : "0.0" };
  }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setAuthor({ name: `📐  Risk Dashboard  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Portfolio Beta",       value: beta.toFixed(2), inline: true },
      { name: "Sharpe Ratio",         value: sharpe.toFixed(2), inline: true },
      { name: "Long Exposure",        value: `${totalLong.toLocaleString()} coins`, inline: true },
      { name: "Short Exposure",       value: `${marginExposure.toLocaleString()} coins`, inline: true },
      { name: "Collateral Locked",    value: `${collateralTotal.toLocaleString()} coins`, inline: true },
      { name: "Margin Utilisation",   value: `${marginUtil}%`, inline: true },
      { name: "Concentration",
        value: concentration.length > 0
          ? concentration.map((c) => `**${c.ticker}**: ${c.pct}%`).join("  ·  ")
          : "*(no holdings)*",
        inline: false },
    )
    .setFooter({ text: "Beta vs GLITCH Index · Higher beta = more volatile relative to market" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks history ──────────────────────────────────────────────────────────

async function handleHistory(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const ticker  = interaction.options.getString("ticker", true);
  const history = await getPriceHistory(guildId, ticker, 12);
  const state   = await getState(guildId, ticker);
  if (!state || !history.length) { await interaction.editReply("No price history yet. Wait for the first tick."); return; }

  const corp   = getCorpMeta(ticker);
  const closes = history.map((h) => h.close).reverse();
  const spark  = sparkline(closes);
  const oldest = history[history.length - 1]!;
  const newest = history[0]!;
  const allTime = pctStr(newest.close, oldest.open);

  const rows = history.slice(0, 8).map((h, i) => {
    const chg = pctStr(h.close, h.open);
    return `Tick ${history.length - i}  ${h.open.toLocaleString()} → ${h.close.toLocaleString()}  ${chg}  vol ${h.volume.toLocaleString()}`;
  });

  const embed = new EmbedBuilder()
    .setColor(corp.color)
    .setAuthor({ name: `📊  Price History  ·  ${ticker}  ·  ${BOT_NAME}` })
    .setTitle(`${corp.emoji}  ${corp.name}  (${corp.sector})`)
    .setDescription([
      `\`${spark}\``,
      `Current: **${state.price.toLocaleString()}** coins  ·  ${trendArrow(state.price, state.prevPrice)} ${pctStr(state.price, state.prevPrice)}`,
      `${closes.length}-tick range: **${allTime}** overall`,
      "",
      "```" + rows.join("\n") + "```",
    ].join("\n"))
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks news ─────────────────────────────────────────────────────────────

async function handleNews(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const events = await getRecentEvents(guildId, 10);
  if (!events.length) { await interaction.editReply("No market events yet."); return; }

  const lines = events.map((e) => {
    const ts = `<t:${Math.floor(e.occurredAt.getTime() / 1000)}:R>`;
    const impact = e.priceImpactBps != null ? ` *(${e.priceImpactBps >= 0 ? "+" : ""}${(e.priceImpactBps / 100).toFixed(1)}%)*` : "";
    return `${ts}  ${e.headline}${impact}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFF4D00)
    .setAuthor({ name: `📰  Market News  ·  ${BOT_NAME}` })
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks earnings ─────────────────────────────────────────────────────────

async function handleEarnings(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const upcoming = await getUpcomingEarnings(guildId);
  if (!upcoming.length) { await interaction.editReply("No earnings scheduled yet. Ask an admin to run `/stocks admin earnings`."); return; }

  const lines = upcoming.map((e) => {
    const corp = getCorpMeta(e.ticker);
    return `${corp.emoji} **${e.ticker}** — <t:${Math.floor(e.revealAt.getTime() / 1000)}:F> (reveals <t:${Math.floor(e.revealAt.getTime() / 1000)}:R>)\nAnalyst estimate: **${e.analystEstimate.toLocaleString()}** *(actuals sealed)*`;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setAuthor({ name: `📅  Earnings Calendar  ·  ${BOT_NAME}` })
    .setDescription(lines.join("\n\n").slice(0, 4000))
    .setFooter({ text: "Actuals are sealed — buy the rumour, sell the news" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks bots ─────────────────────────────────────────────────────────────

async function handleBots(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const botDefs = [
    { id: "ARBITRON",  name: "ARBITRON",   desc: "Mean reversion — buys oversold, sells overbought (±12% vs MA)", emoji: "🔵" },
    { id: "MOMENTUM9", name: "MOMENTUM-9", desc: "Trend following — chases 2-tick up/downtrends",                 emoji: "🟠" },
    { id: "GHOST",     name: "THE GHOST",  desc: "Market maker — posts bid/ask around fair value, earns spread",  emoji: "👻" },
  ];

  const fields: { name: string; value: string; inline: boolean }[] = [];
  for (const bot of botDefs) {
    const states = await getBotStates(guildId, bot.id);
    const totalShares = states.reduce((s, x) => s + x.shares, 0);
    const budget = states[0] ? Number(states[0].cashBudget) : 500_000;
    const positions = states.filter((s) => s.shares > 0).map((s) => `${s.ticker}×${s.shares}`).join("  ");
    fields.push({
      name: `${bot.emoji} ${bot.name}`,
      value: `*${bot.desc}*\nBudget: **${budget.toLocaleString()}** coins | Total shares: **${totalShares.toLocaleString()}**\n${positions || "*(no positions)*"}`,
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x2C2C2C)
    .setAuthor({ name: `🤖  NPC Algorithmic Traders  ·  ${BOT_NAME}` })
    .addFields(...fields)
    .setFooter({ text: "Bots trade on each 2h tick · They create organic market liquidity" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks rich ─────────────────────────────────────────────────────────────

async function handleRich(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply();
  const allHolders = await import("../stockDb.js").then((m) => m.getAllHolders(guildId));
  const states     = await getStates(guildId);
  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;

  const byUser = new Map<string, number>();
  for (const h of allHolders) {
    byUser.set(h.userId, (byUser.get(h.userId) ?? 0) + h.shares * (priceMap[h.ticker] ?? h.avgCost));
  }

  const sorted = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) { await interaction.editReply("No traders on the leaderboard yet."); return; }

  const config = await getGuildConfig(guildId);
  const em = config.currencyEmoji ?? "🪙";

  const lines = await Promise.all(sorted.map(async ([uid, val], i) => {
    const member = interaction.guild!.members.cache.get(uid) ?? await interaction.guild!.members.fetch(uid).catch(() => null);
    const name   = member?.displayName ?? `User ${uid}`;
    const wallet = await walletBalance(guildId, uid);
    return `**${i + 1}.** ${name} — Holdings: **${val.toLocaleString()} ${em}** · Wallet: ${wallet.toLocaleString()} ${em} · Net: **${(val + wallet).toLocaleString()} ${em}**`;
  }));

  const embed = new EmbedBuilder()
    .setColor(THEME.elite)
    .setAuthor({ name: `🏆  Portfolio Leaderboard  ·  ${BOT_NAME}` })
    .setTitle("Top Traders by Portfolio Value")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Ranked by holdings market value + wallet balance" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks takeover ─────────────────────────────────────────────────────────

async function handleTakeover(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker  = interaction.options.getString("ticker", true);
  const corp    = getCorpMeta(ticker);
  const holding = await getHolding(guildId, userId, ticker);
  const state   = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }

  const heldShares = holding?.shares ?? 0;
  const pctFloat   = heldShares / corp.floatShares;

  if (pctFloat < 0.20) {
    await interaction.editReply(`❌ You need ≥20% of the float to launch a takeover. You hold **${heldShares.toLocaleString()} / ${corp.floatShares.toLocaleString()}** shares (${(pctFloat * 100).toFixed(2)}%).`);
    return;
  }

  const existing = await getActiveTakeover(guildId, ticker);
  if (existing) { await interaction.editReply("❌ A takeover raid is already active on this corp."); return; }

  const bidPrice = takeoverBidPrice(state.price);
  const id = await launchTakeover(guildId, ticker, userId, bidPrice);

  const embed = new EmbedBuilder()
    .setColor(THEME.elite)
    .setAuthor({ name: `🏴  Hostile Takeover Launched  ·  ${BOT_NAME}` })
    .setDescription([
      `You are raiding **${ticker} — ${corp.name}**`,
      `Current float held: **${(pctFloat * 100).toFixed(2)}%** (${heldShares.toLocaleString()} of ${corp.floatShares.toLocaleString()} shares)`,
      `Bid price: **${bidPrice.toLocaleString()}** coins/share (15% premium)`,
      `Raid duration: **48 hours**`,
      ``,
      `If you hold ≥20% when the raid ends, control is confirmed.`,
    ].join("\n"))
    .setFooter({ text: `Takeover ID: ${id}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks option chain ─────────────────────────────────────────────────────

async function handleOptionChain(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const ticker  = interaction.options.getString("ticker", true);
  const state   = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }
  const corp      = getCorpMeta(ticker);
  const baseRate  = await getNeuralBankRate(guildId);
  const strikes   = strikeChain(state.price);

  const rows: string[] = ["Strike      Call      Put       Delta(C)  IV"];
  for (const strike of strikes) {
    const callPrem = optionPremium(state.price, strike, 6, baseRate, state.impliedVol, true);
    const putPrem  = optionPremium(state.price, strike, 6, baseRate, state.impliedVol, false);
    const { delta } = optionGreeks(state.price, strike, 6, baseRate, state.impliedVol, true);
    const atm = Math.abs(strike - state.price) < (state.price * 0.02) ? " ← ATM" : "";
    rows.push(
      `${String(strike.toLocaleString()).padEnd(11)} ${String(callPrem.toLocaleString()).padEnd(9)} ${String(putPrem.toLocaleString()).padEnd(9)} ${delta.toFixed(2).padEnd(9)} ${(state.impliedVol / 100).toFixed(0)}%${atm}`
    );
  }

  const embed = new EmbedBuilder()
    .setColor(corp.color)
    .setAuthor({ name: `⚡  Option Chain  ·  ${ticker}  ·  ${BOT_NAME}` })
    .setDescription([
      `${corp.emoji} **${corp.name}** | Spot: **${state.price.toLocaleString()}** | IV: **${(state.impliedVol / 100).toFixed(0)}%**`,
      `Premiums shown for 6-tick (12h) expiry, 1 lot`,
      "",
      "```" + rows.join("\n") + "```",
    ].join("\n"))
    .setFooter({ text: "Use /stocks option buy to trade · Prices update on each 2h tick" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks option buy ───────────────────────────────────────────────────────

async function handleOptionBuy(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticker  = interaction.options.getString("ticker", true);
  const type    = interaction.options.getString("type", true) as "call" | "put";
  const strike  = interaction.options.getInteger("strike", true);
  const expiry  = interaction.options.getInteger("expiry", true);
  const lots    = interaction.options.getInteger("lots", false) ?? 1;

  const state = await getState(guildId, ticker);
  if (!state) { await interaction.editReply("Corp not found."); return; }
  const baseRate = await getNeuralBankRate(guildId);
  const premium  = optionPremium(state.price, strike, expiry, baseRate, state.impliedVol, type === "call") * lots;

  const balance = await walletBalance(guildId, userId);
  if (balance < premium) {
    await interaction.editReply(`❌ You need **${premium.toLocaleString()}** coins for this contract (you have ${balance.toLocaleString()}).`);
    return;
  }

  const existing = await getUserOptions(guildId, userId);
  if (existing.length >= 10) { await interaction.editReply("❌ You can hold a maximum of 10 open option contracts."); return; }

  await deductBalance(guildId, userId, premium);
  const id = await openOption(guildId, userId, ticker, type, strike, expiry, premium, lots);
  const greeks = optionGreeks(state.price, strike, expiry, baseRate, state.impliedVol, type === "call");
  const corp = getCorpMeta(ticker);

  const embed = new EmbedBuilder()
    .setColor(type === "call" ? THEME.success : THEME.danger)
    .setAuthor({ name: `⚡  Option Purchased  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Contract",  value: `\`${id}\`  ${type.toUpperCase()} ${ticker} @${strike}`, inline: true },
      { name: "Lots",      value: lots.toLocaleString(), inline: true },
      { name: "Premium",   value: `${premium.toLocaleString()} coins`, inline: true },
      { name: "Spot",      value: `${state.price.toLocaleString()} coins`, inline: true },
      { name: "Expiry",    value: `${expiry} ticks (~${expiry * 2}h)`, inline: true },
      { name: "Delta",     value: greeks.delta.toFixed(2), inline: true },
      { name: "Theta/day", value: greeks.theta.toFixed(2), inline: true },
      { name: "IV",        value: `${(state.impliedVol / 100).toFixed(0)}%`, inline: true },
    )
    .setDescription(`${type === "call" ? "📈" : "📉"} You profit if **${ticker}** ${type === "call" ? "rises above" : "falls below"} **${strike.toLocaleString()}**.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks option sell ──────────────────────────────────────────────────────

async function handleOptionSell(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id       = interaction.options.getInteger("id", true);
  const opts     = await getUserOptions(guildId, userId);
  const opt      = opts.find((o) => o.id === id);
  if (!opt) { await interaction.editReply("❌ Option not found."); return; }

  const state     = await getState(guildId, opt.ticker);
  if (!state)     { await interaction.editReply("Corp not found."); return; }
  const baseRate  = await getNeuralBankRate(guildId);
  const remaining = (opt.expiresAt.getTime() - Date.now()) / (2 * 60 * 60_000); // ticks remaining
  const isCall    = opt.optionType === "call";

  if (remaining <= 0) {
    await interaction.editReply("❌ This option has already expired.");
    return;
  }

  // Price at current market
  const currentPremium = optionPremium(state.price, opt.strike, Math.max(1, Math.round(remaining)), baseRate, state.impliedVol, isCall) * opt.lots;
  await addBalance(guildId, userId, currentPremium);
  await setOptionStatus(opt.id, "expired"); // mark closed

  const pnl = currentPremium - opt.premium;
  const embed = new EmbedBuilder()
    .setColor(pnl >= 0 ? THEME.success : THEME.danger)
    .setAuthor({ name: `✅  Option Closed  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Contract",      value: `${opt.optionType.toUpperCase()} ${opt.ticker} @${opt.strike}`, inline: true },
      { name: "Sale Value",    value: `${currentPremium.toLocaleString()} coins`, inline: true },
      { name: "Cost Basis",    value: `${opt.premium.toLocaleString()} coins`, inline: true },
      { name: "P&L",           value: `${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()} coins`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks option list ──────────────────────────────────────────────────────

async function handleOptionList(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const opts   = await getUserOptions(guildId, userId);
  const states = await getStates(guildId);
  const priceMap: Record<string, number> = {};
  for (const s of states) priceMap[s.ticker] = s.price;

  if (!opts.length) { await interaction.editReply("You have no open option contracts."); return; }

  const baseRate = await getNeuralBankRate(guildId);
  const lines = opts.map((o) => {
    const cur  = priceMap[o.ticker] ?? 0;
    const rem  = Math.max(0, Math.round((o.expiresAt.getTime() - Date.now()) / (2 * 60 * 60_000)));
    const curPrem = rem > 0 ? optionPremium(cur, o.strike, rem, baseRate, 2000, o.optionType === "call") * o.lots : 0;
    const pnl  = curPrem - o.premium;
    return `\`${o.id}\` ${o.optionType.toUpperCase()} **${o.ticker}** @${o.strike} ×${o.lots} | Cost: ${o.premium.toLocaleString()} | Now: ${curPrem.toLocaleString()} | P&L: ${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()} | exp <t:${Math.floor(o.expiresAt.getTime() / 1000)}:R>`;
  });

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.xp)
      .setAuthor({ name: `⚡  Open Options  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n"))
      .setTimestamp()],
  });
}

// ─── /stocks bond buy ─────────────────────────────────────────────────────────

async function handleBondBuy(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const type     = interaction.options.getString("type", true) as "corp" | "junk";
  const amount   = interaction.options.getInteger("amount", true);
  const maturity = interaction.options.getInteger("maturity", true);
  const baseRate = await getNeuralBankRate(guildId);

  const yieldBps = type === "corp" ? corpBondYield(baseRate) : junkBondYield(baseRate);
  const balance  = await walletBalance(guildId, userId);
  if (balance < amount) {
    await interaction.editReply(`❌ You need **${amount.toLocaleString()}** coins (you have ${balance.toLocaleString()}).`);
    return;
  }

  const days      = maturity;
  const interest  = Math.round(amount * yieldBps / 10_000 * (days / 365));
  const maturesAt = new Date(Date.now() + days * 86_400_000);

  await deductBalance(guildId, userId, amount);
  const id = await buyBond(guildId, userId, type, amount, yieldBps, maturesAt);

  const embed = new EmbedBuilder()
    .setColor(type === "corp" ? THEME.info : THEME.warn)
    .setAuthor({ name: `📄  Bond Purchased  ·  ${BOT_NAME}` })
    .addFields(
      { name: "Type",      value: type === "corp" ? "Corp Bond (ARSK-backed)" : "Junk Bond (high yield)", inline: true },
      { name: "Principal", value: `${amount.toLocaleString()} coins`, inline: true },
      { name: "Yield",     value: `${(yieldBps / 100).toFixed(2)}% p.a.`, inline: true },
      { name: "Maturity",  value: `${days} days`, inline: true },
      { name: "Interest",  value: `${interest.toLocaleString()} coins`, inline: true },
      { name: "Payout",    value: `${(amount + interest).toLocaleString()} coins`, inline: true },
    )
    .setDescription(type === "junk" ? "⚠️ **8% chance of default on maturity.** High risk, high reward." : "✅ Near-zero default risk. Safe fixed return.")
    .setFooter({ text: `Bond ID: ${id} · Matures <t:${Math.floor(maturesAt.getTime() / 1000)}:R>` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /stocks bond list ────────────────────────────────────────────────────────

async function handleBondList(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const bonds = await getUserBonds(guildId, userId);
  if (!bonds.length) { await interaction.editReply("You have no active bonds."); return; }

  const lines = bonds.map((b) => {
    const days = (b.maturesAt.getTime() - b.purchasedAt.getTime()) / 86_400_000;
    const interest = Math.round(Number(b.principal) * b.yieldBps / 10_000 * (days / 365));
    return `\`${b.id}\` ${b.bondType.toUpperCase()} bond — **${Number(b.principal).toLocaleString()}** @ ${(b.yieldBps / 100).toFixed(2)}%  +${interest.toLocaleString()} interest — matures <t:${Math.floor(b.maturesAt.getTime() / 1000)}:R>`;
  });

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `📄  Active Bonds  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n"))
      .setTimestamp()],
  });
}

// ─── /stocks ipo list ─────────────────────────────────────────────────────────

async function handleIpoList(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply();
  const ipos = await import("../stockDb.js").then((m) => m.getScheduledIpos(guildId));
  if (!ipos.length) { await interaction.editReply("No IPOs currently scheduled or open."); return; }

  const lines = ipos.map((ipo) => {
    const statusEmoji = ipo.status === "open" ? "🟢" : "⏳";
    return `\`${ipo.id}\` ${statusEmoji} **${ipo.ticker} — ${ipo.corpName}**\nPrice: **${ipo.ipoPrice.toLocaleString()}** coins | Max per user: **${ipo.maxPerUser.toLocaleString()}** shares\n${ipo.status === "open" ? `Closes <t:${Math.floor(ipo.offeringEnd.getTime() / 1000)}:R>` : `Opens <t:${Math.floor(ipo.offeringStart.getTime() / 1000)}:R>`}`;
  });

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.economy)
      .setAuthor({ name: `🚀  IPO Schedule  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: "Use /stocks ipo buy [id] to participate in open IPOs" })
      .setTimestamp()],
  });
}

// ─── /stocks ipo buy ──────────────────────────────────────────────────────────

async function handleIpoBuy(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ipoId = interaction.options.getInteger("id", true);
  const shares = interaction.options.getInteger("shares", true);

  const ipos = await getOpenIpos(guildId);
  const ipo  = ipos.find((i) => i.id === ipoId);
  if (!ipo) { await interaction.editReply("❌ IPO not found or not currently open."); return; }

  const existingAlloc = await getUserIpoAlloc(guildId, ipoId, userId);
  const alreadyBought = existingAlloc?.shares ?? 0;
  if (alreadyBought + shares > ipo.maxPerUser) {
    await interaction.editReply(`❌ You can only buy **${ipo.maxPerUser - alreadyBought}** more shares in this IPO.`);
    return;
  }

  const totalAllocated = await getIpoTotalAllocated(guildId, ipoId);
  if (totalAllocated + shares > ipo.totalShares) {
    await interaction.editReply(`❌ Only **${ipo.totalShares - totalAllocated}** shares remain in this IPO.`);
    return;
  }

  const cost = shares * ipo.ipoPrice;
  const balance = await walletBalance(guildId, userId);
  if (balance < cost) { await interaction.editReply(`❌ You need **${cost.toLocaleString()}** coins.`); return; }

  await deductBalance(guildId, userId, cost);
  await addIpoAlloc(guildId, ipoId, userId, shares);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🚀  IPO Allocation  ·  ${BOT_NAME}` })
      .setDescription(`**${shares.toLocaleString()} shares** of **${ipo.ticker} — ${ipo.corpName}** allocated at **${ipo.ipoPrice.toLocaleString()}** coins/share.\nTotal: **${cost.toLocaleString()}** coins locked until IPO closes.`)
      .setTimestamp()],
  });
}

// ─── /stocks admin rate ───────────────────────────────────────────────────────

async function handleAdminRate(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = interaction.guild!.members.cache.get(userId);
  const isAdmin = interaction.guild!.ownerId === userId || member?.permissions.has(PermissionFlagsBits.Administrator);
  const newRate = interaction.options.getInteger("set", false);

  if (newRate != null) {
    if (!isAdmin) { await interaction.editReply("❌ Only admins can change the Neural Bank rate."); return; }
    await setNeuralBankRate(guildId, newRate, userId);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(THEME.info)
        .setAuthor({ name: `🏦  Neural Bank Rate Updated  ·  ${BOT_NAME}` })
        .setDescription(`Base rate set to **${(newRate / 100).toFixed(2)}%** by <@${userId}>.\n\n📉 Higher rates → cheaper bonds earn less, stocks drift bearish.\n📈 Lower rates → cheap money, bullish market sentiment.`)
        .setTimestamp()],
    });
    return;
  }

  const rate = await getNeuralBankRate(guildId);
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `🏦  Neural Bank  ·  ${BOT_NAME}` })
      .addFields(
        { name: "Base Rate",       value: `${(rate / 100).toFixed(2)}%`, inline: true },
        { name: "Corp Bond Yield", value: `${(corpBondYield(rate) / 100).toFixed(2)}%`, inline: true },
        { name: "Junk Bond Yield", value: `${(junkBondYield(rate) / 100).toFixed(2)}%`, inline: true },
      )
      .setFooter({ text: "Admin use /stocks admin rate set [bps] to change" })
      .setTimestamp()],
  });
}

// ─── /stocks admin earnings ───────────────────────────────────────────────────

async function handleAdminEarnings(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = interaction.guild!.members.cache.get(userId);
  const isAdmin = interaction.guild!.ownerId === userId || member?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) { await interaction.editReply("❌ Admins only."); return; }

  for (const corp of CORPS) {
    const revealAt = new Date(Date.now() + (2 + Math.random() * 5) * 24 * 60 * 60_000);
    const base     = corp.initPrice * 1_000;
    const estimate = Math.round(base * (0.90 + Math.random() * 0.20));
    const actual   = Math.round(base * (0.85 + Math.random() * 0.30));
    await scheduleEarnings(guildId, corp.ticker, estimate, actual, revealAt);
  }

  await interaction.editReply("✅ Earnings reports scheduled for all 8 corps. Use `/stocks earnings` to see the calendar.");
}
