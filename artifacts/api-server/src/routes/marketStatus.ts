import { Router, type IRouter } from "express";
import { client } from "../bot/client.js";
import { getStates } from "../bot/stockDb.js";
import { getRecentEvents } from "../bot/stockDb.js";
import { CORPS, getCorpMeta } from "../bot/stockEngine.js";

const router: IRouter = Router();

router.get("/market-status", async (_req, res) => {
  try {
    const ready = client.isReady();
    if (!ready || client.guilds.cache.size === 0) {
      return res.json({ corps: [], events: [], lastTickAt: null, totalVolume: 0 });
    }

    const guildId = client.guilds.cache.first()!.id;
    const [states, events] = await Promise.all([
      getStates(guildId),
      getRecentEvents(guildId, 8),
    ]);

    const corps = states.map((s) => {
      const meta = getCorpMeta(s.ticker);
      const change = s.prevPrice > 0
        ? ((s.price - s.prevPrice) / s.prevPrice) * 100
        : 0;
      return {
        ticker:    s.ticker,
        name:      meta.name,
        sector:    meta.sector,
        price:     s.price,
        prevPrice: s.prevPrice,
        change:    Math.round(change * 100) / 100,
        volume24h: s.volume24h,
        halted:    s.haltedUntil ? new Date(s.haltedUntil).getTime() > Date.now() : false,
        lastTickAt: s.lastTickAt ? s.lastTickAt.toISOString() : null,
      };
    });

    const sortedCorps = [...CORPS].map((c) => corps.find((s) => s.ticker === c.ticker)).filter(Boolean);
    const lastTickAt = corps.reduce((latest, c) => {
      if (!c!.lastTickAt) return latest;
      return !latest || c!.lastTickAt > latest ? c!.lastTickAt : latest;
    }, null as string | null);
    const totalVolume = corps.reduce((sum, c) => sum + (c!.volume24h ?? 0), 0);

    return res.json({
      corps: sortedCorps,
      events: events.map((e) => ({
        id:            e.id,
        ticker:        e.ticker,
        eventType:     e.eventType,
        headline:      e.headline,
        impactBps:     e.priceImpactBps,
        occurredAt:    e.occurredAt ? e.occurredAt.toISOString() : null,
      })),
      lastTickAt,
      totalVolume,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch market status" });
  }
});

export default router;
