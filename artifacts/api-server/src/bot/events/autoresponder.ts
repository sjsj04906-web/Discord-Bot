import type { Message } from "discord.js";
import { getAutoResponders } from "../db.js";

const cache = new Map<string, { data: Array<{ trigger: string; response: string; matchType: string }>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getCachedResponders(guildId: string) {
  const now = Date.now();
  const hit  = cache.get(guildId);
  if (hit && hit.expiresAt > now) return hit.data;

  const rows = await getAutoResponders(guildId);
  const data = rows.map((r) => ({ trigger: r.trigger, response: r.response, matchType: r.matchType }));
  cache.set(guildId, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}

export function invalidateAutoResponderCache(guildId: string) {
  cache.delete(guildId);
}

export async function handleAutoResponder(message: Message): Promise<boolean> {
  if (!message.guildId || message.author.bot) return false;

  const responders = await getCachedResponders(message.guildId).catch(() => []);
  const content    = message.content.toLowerCase();

  for (const r of responders) {
    const trigger = r.trigger.toLowerCase();
    let matched   = false;

    if (r.matchType === "exact")      matched = content === trigger;
    else if (r.matchType === "startswith") matched = content.startsWith(trigger);
    else                               matched = content.includes(trigger);

    if (matched) {
      await message.reply({ content: r.response }).catch(() => {});
      return true;
    }
  }

  return false;
}
