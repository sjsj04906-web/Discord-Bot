import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { getBalance, deductBalance } from "../db.js";
import { db, marketInventoryTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

// ── Item catalog ──────────────────────────────────────────────────────────────
export interface MarketListing {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  price:       number;
  durationMs?: number;
}

export const ITEM_CATALOG: MarketListing[] = [
  { id: "rob_shield",    name: "Rob Shield",      emoji: "🛡️", description: "Immune to `/rob` for 12 hours.",         price: 2_500, durationMs: 12 * 60 * 60_000 },
  { id: "xp_surge",     name: "XP Surge",         emoji: "⚡", description: "+100% XP gain for 1 hour.",              price: 3_000, durationMs:  1 * 60 * 60_000 },
  { id: "coin_magnet",  name: "Coin Magnet",      emoji: "🧲", description: "+50% coin yield on `/work` & `/fish` for 2 hours.", price: 4_000, durationMs: 2 * 60 * 60_000 },
  { id: "jackpot_chip", name: "Jackpot Chip",     emoji: "🎰", description: "Guarantees a win on your next `/gamble`.", price: 6_000 },
  { id: "ghost_cloak",  name: "Ghost Cloak",      emoji: "👻", description: "Hides you from `/richest` for 24 hours.", price: 1_500, durationMs: 24 * 60 * 60_000 },
  { id: "lucky_charm",  name: "Lucky Charm",      emoji: "🍀", description: "+25% success rate on your next `/rob`.",  price: 2_000 },
  { id: "data_pack",    name: "Data Pack",        emoji: "💾", description: "Instantly grant 1,000–3,000 bonus coins.", price: 1_000 },
  { id: "exp_injector", name: "EXP Injector",     emoji: "💉", description: "Instantly grant 500–1,500 bonus XP.",     price: 2_000 },
  { id: "daily_reset",  name: "Daily Reset",      emoji: "🔄", description: "Resets your `/daily` cooldown immediately.", price: 5_000 },
  { id: "fish_lure",    name: "Quantum Lure",     emoji: "🎣", description: "+40% rare fish chance on next 5 casts.",   price: 3_500 },
];

// ── Daily rotation: 5 deterministic items seeded by date ─────────────────────
export function getTodaysMarket(): MarketListing[] {
  const today = new Date();
  const seed  = today.getUTCFullYear() * 10_000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  const shuffled = [...ITEM_CATALOG].sort((a, b) => {
    const ha = ((seed * 9301 + a.id.charCodeAt(0) * 49297) % 233280) / 233280;
    const hb = ((seed * 9301 + b.id.charCodeAt(0) * 49297) % 233280) / 233280;
    return ha - hb;
  });
  return shuffled.slice(0, 5);
}

// ── DB helpers ────────────────────────────────────────────────────────────────
export async function getUserInventory(guildId: string, userId: string) {
  return db
    .select()
    .from(marketInventoryTable)
    .where(and(eq(marketInventoryTable.guildId, guildId), eq(marketInventoryTable.userId, userId)));
}

export async function addToInventory(guildId: string, userId: string, itemId: string, expiresAt?: Date) {
  await db.insert(marketInventoryTable).values({ guildId, userId, itemId, expiresAt });
}

export async function markItemUsed(id: number) {
  await db
    .update(marketInventoryTable)
    .set({ usedAt: new Date() })
    .where(eq(marketInventoryTable.id, id));
}

export async function hasActiveItem(guildId: string, userId: string, itemId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select()
    .from(marketInventoryTable)
    .where(and(
      eq(marketInventoryTable.guildId, guildId),
      eq(marketInventoryTable.userId, userId),
      eq(marketInventoryTable.itemId, itemId),
      isNull(marketInventoryTable.usedAt),
    ));
  return rows.some((r) => !r.expiresAt || r.expiresAt > now);
}

// ── Slash command ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("market")
  .setDescription("Browse and buy items from the Black Market.")
  .addSubcommand((s) => s
    .setName("view")
    .setDescription("See today's rotating Black Market listings."))
  .addSubcommand((s) => s
    .setName("buy")
    .setDescription("Purchase an item from today's market.")
    .addStringOption((o) => o
      .setName("item")
      .setDescription("Item to buy (name or ID)")
      .setRequired(true)))
  .addSubcommand((s) => s
    .setName("inventory")
    .setDescription("View your owned market items."))
  .addSubcommand((s) => s
    .setName("use")
    .setDescription("Activate a passive or one-time item from your inventory.")
    .addStringOption((o) => o
      .setName("item")
      .setDescription("Item ID to use")
      .setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;

  // ── /market view ────────────────────────────────────────────────────────────
  if (sub === "view") {
    const listings = getTodaysMarket();
    const nextReset = new Date();
    nextReset.setUTCHours(24, 0, 0, 0);

    const fields = listings.map((item, i) => ({
      name:   `${item.emoji}  Slot ${i + 1} · ${item.name}`,
      value:  `> ${item.description}\n> 🪙 **${item.price.toLocaleString()}** coins  ·  ID: \`${item.id}\``,
      inline: false,
    }));

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.elite as number)
          .setAuthor({ name: `🕵️  Black Market  ·  ${BOT_NAME}` })
          .setDescription(`> *5 items rotate every 24 hours. Use \`/market buy [id]\` to purchase.*\n${SEP}`)
          .addFields(...fields)
          .setFooter({ text: `Resets at midnight UTC  ·  ${BOT_NAME} ◆ Black Market` })
          .setTimestamp(nextReset),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── /market buy ─────────────────────────────────────────────────────────────
  if (sub === "buy") {
    const query    = interaction.options.getString("item", true).toLowerCase().replace(/ /g, "_");
    const listings = getTodaysMarket();
    const item     = listings.find((l) => l.id === query || l.name.toLowerCase() === query.replace(/_/g, " "));

    if (!item) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> \`${query}\` is not available today. Check \`/market view\` for today's listings.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const bal = await getBalance(guildId, userId);
    if (bal < item.price) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> You need **${item.price.toLocaleString()}** coins. You only have **${bal.toLocaleString()}**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await deductBalance(guildId, userId, item.price);
    const expiresAt = item.durationMs ? new Date(Date.now() + item.durationMs) : undefined;
    await addToInventory(guildId, userId, item.id, expiresAt);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `${item.emoji}  Acquired: ${item.name}  ·  ${BOT_NAME}` })
          .setDescription(`> ${item.description}`)
          .addFields(
            { name: "◈ Cost",    value: `🪙 ${item.price.toLocaleString()} coins`,               inline: true },
            { name: "◈ Expires", value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "One-use", inline: true },
          )
          .setFooter({ text: `Use /market inventory to view · /market use to activate` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── /market inventory ────────────────────────────────────────────────────────
  if (sub === "inventory") {
    const owned = await getUserInventory(guildId, userId);
    const now   = new Date();
    const active = owned.filter((r) => !r.usedAt && (!r.expiresAt || r.expiresAt > now));

    if (active.length === 0) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.muted).setDescription(`> Your inventory is empty. Visit \`/market view\` to browse today's listings.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = active.map((r) => {
      const catalog = ITEM_CATALOG.find((c) => c.id === r.itemId);
      const name    = catalog ? `${catalog.emoji}  **${catalog.name}**` : `\`${r.itemId}\``;
      const expiry  = r.expiresAt ? `expires <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>` : "one-use";
      return `${name}  ·  ${expiry}`;
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.economy as number)
          .setAuthor({ name: `🎒  Inventory  ·  ${BOT_NAME}` })
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${active.length} item(s)  ·  ${BOT_NAME} ◆ Black Market` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── /market use ─────────────────────────────────────────────────────────────
  if (sub === "use") {
    const itemId = interaction.options.getString("item", true).toLowerCase().replace(/ /g, "_");
    const owned  = await getUserInventory(guildId, userId);
    const now    = new Date();
    const row    = owned.find((r) => r.itemId === itemId && !r.usedAt && (!r.expiresAt || r.expiresAt > now));

    if (!row) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> You don't have an active \`${itemId}\` in your inventory.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const catalog = ITEM_CATALOG.find((c) => c.id === itemId);

    // Instant-effect items
    if (itemId === "data_pack") {
      const { addBalance } = await import("../db.js");
      const bonus = Math.floor(1_000 + Math.random() * 2_000);
      await addBalance(guildId, userId, bonus);
      await markItemUsed(row.id);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.success).setDescription(`> 💾 Data Pack cracked open. **+${bonus.toLocaleString()} coins** deposited.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (itemId === "exp_injector") {
      const { addXp } = await import("../db.js");
      const bonus = Math.floor(500 + Math.random() * 1_000);
      await addXp(guildId, userId, bonus);
      await markItemUsed(row.id);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.xp as number).setDescription(`> 💉 EXP Injector fired. **+${bonus.toLocaleString()} XP** flooded into your core.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (itemId === "daily_reset") {
      const { db: _db, economyTable } = await import("@workspace/db");
      const { and: _and, eq: _eq }    = await import("drizzle-orm");
      await _db.update(economyTable).set({ lastDaily: null }).where(_and(_eq(economyTable.guildId, guildId), _eq(economyTable.userId, userId)));
      await markItemUsed(row.id);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.success).setDescription(`> 🔄 Daily Reset consumed. Your \`/daily\` cooldown has been cleared.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Passive buffs — just confirm they're active
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription(`> ${catalog?.emoji ?? "◈"} **${catalog?.name ?? itemId}** is already active in your inventory and will apply automatically.\n> ${catalog?.description ?? ""}`)
          .setFooter({ text: row.expiresAt ? `Expires <t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>` : "One-use — activates on next eligible action" }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
