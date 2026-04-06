import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction, type Client,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { getBalance, deductBalance, addBalance } from "../db.js";
import { db, lotteryStateTable, lotteryTicketsTable } from "@workspace/db";
import { eq, and, sum, desc } from "drizzle-orm";

const TICKET_PRICE    = 500;
const MAX_TICKETS     = 100;
const LOTTERY_DAYS    = 7;
const HOUSE_CUT       = 0.05;

// ── DB helpers ────────────────────────────────────────────────────────────────
async function ensureLotteryState(guildId: string) {
  const rows = await db.select().from(lotteryStateTable).where(eq(lotteryStateTable.guildId, guildId));
  if (rows.length > 0) return rows[0];
  const endsAt = new Date(Date.now() + LOTTERY_DAYS * 24 * 60 * 60_000);
  const inserted = await db.insert(lotteryStateTable).values({ guildId, pot: 0, endsAt }).returning();
  return inserted[0];
}

export async function getLotteryState(guildId: string) {
  return ensureLotteryState(guildId);
}

async function getUserTickets(guildId: string, userId: string): Promise<number> {
  const rows = await db.select().from(lotteryTicketsTable).where(
    and(eq(lotteryTicketsTable.guildId, guildId), eq(lotteryTicketsTable.userId, userId))
  );
  return rows[0]?.count ?? 0;
}

async function getTotalTickets(guildId: string): Promise<number> {
  const rows = await db.select({ total: sum(lotteryTicketsTable.count) }).from(lotteryTicketsTable).where(eq(lotteryTicketsTable.guildId, guildId));
  return Number(rows[0]?.total ?? 0);
}

async function upsertTickets(guildId: string, userId: string, delta: number) {
  const rows = await db.select().from(lotteryTicketsTable).where(
    and(eq(lotteryTicketsTable.guildId, guildId), eq(lotteryTicketsTable.userId, userId))
  );
  if (rows.length === 0) {
    await db.insert(lotteryTicketsTable).values({ guildId, userId, count: delta, updatedAt: new Date() });
  } else {
    await db.update(lotteryTicketsTable)
      .set({ count: rows[0].count + delta, updatedAt: new Date() })
      .where(and(eq(lotteryTicketsTable.guildId, guildId), eq(lotteryTicketsTable.userId, userId)));
  }
}

async function clearTickets(guildId: string) {
  await db.delete(lotteryTicketsTable).where(eq(lotteryTicketsTable.guildId, guildId));
}

// ── Draw winner ───────────────────────────────────────────────────────────────
export async function drawLottery(guildId: string, client?: Client): Promise<{ winnerId: string | null; payout: number }> {
  const state = await getLotteryState(guildId);
  if (state.pot === 0) return { winnerId: null, payout: 0 };

  const allTickets = await db
    .select()
    .from(lotteryTicketsTable)
    .where(eq(lotteryTicketsTable.guildId, guildId));

  const nextEnds = new Date(Date.now() + LOTTERY_DAYS * 24 * 60 * 60_000);

  if (allTickets.length === 0) {
    await db.update(lotteryStateTable).set({ pot: 0, endsAt: nextEnds }).where(eq(lotteryStateTable.guildId, guildId));
    return { winnerId: null, payout: 0 };
  }

  // Weighted random draw
  const pool: string[] = [];
  for (const row of allTickets) {
    for (let i = 0; i < row.count; i++) pool.push(row.userId);
  }
  const winnerId = pool[Math.floor(Math.random() * pool.length)];
  const payout   = Math.floor(state.pot * (1 - HOUSE_CUT));

  await addBalance(guildId, winnerId, payout);
  await clearTickets(guildId);
  await db.update(lotteryStateTable).set({
    pot: 0,
    endsAt: nextEnds,
    lastWinnerId: winnerId,
    lastWonAmount: payout,
    lastDrawAt: new Date(),
  }).where(eq(lotteryStateTable.guildId, guildId));

  return { winnerId, payout };
}

// ── Slash command ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("lottery")
  .setDescription("Server lottery — buy tickets, win the pot.")
  .addSubcommand((s) => s
    .setName("buy")
    .setDescription(`Buy lottery tickets (${TICKET_PRICE.toLocaleString()} coins each, max ${MAX_TICKETS}).`)
    .addIntegerOption((o) => o
      .setName("count")
      .setDescription("Number of tickets to buy (max 100)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_TICKETS)))
  .addSubcommand((s) => s
    .setName("pot")
    .setDescription("See the current lottery jackpot and your tickets."))
  .addSubcommand((s) => s
    .setName("draw")
    .setDescription("[Admin] Force an early lottery draw."));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;

  // ── /lottery buy ─────────────────────────────────────────────────────────────
  if (sub === "buy") {
    const count    = interaction.options.getInteger("count", true);
    const cost     = count * TICKET_PRICE;
    const bal      = await getBalance(guildId, userId);

    if (bal < cost) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> **${count}x tickets** costs 🪙 **${cost.toLocaleString()}**. You have **${bal.toLocaleString()}**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await deductBalance(guildId, userId, cost);

    // Add to pot
    const state = await ensureLotteryState(guildId);
    await db.update(lotteryStateTable)
      .set({ pot: state.pot + cost })
      .where(eq(lotteryStateTable.guildId, guildId));

    // Add tickets
    await upsertTickets(guildId, userId, count);
    const myTickets = await getUserTickets(guildId, userId);
    const total     = await getTotalTickets(guildId);
    const odds      = total > 0 ? ((myTickets / total) * 100).toFixed(1) : "100.0";
    const newState  = await getLotteryState(guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.elite as number)
          .setAuthor({ name: `🎟️  Lottery Tickets Purchased  ·  ${BOT_NAME}` })
          .addFields(
            { name: "◈ Bought",   value: `${count}x ticket${count > 1 ? "s" : ""}`,          inline: true },
            { name: "◈ You Hold", value: `${myTickets}x ticket${myTickets > 1 ? "s" : ""}`,  inline: true },
            { name: "◈ Win Odds", value: `~${odds}%`,                                          inline: true },
            { name: "◈ Jackpot",  value: `🪙 ${newState.pot.toLocaleString()}`,                inline: true },
            { name: "◈ Draw",     value: `<t:${Math.floor(newState.endsAt.getTime() / 1000)}:R>`, inline: true },
          )
          .setFooter({ text: `${BOT_NAME} ◆ Neural Lottery` })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── /lottery pot ─────────────────────────────────────────────────────────────
  if (sub === "pot") {
    const state     = await getLotteryState(guildId);
    const myTickets = await getUserTickets(guildId, userId);
    const total     = await getTotalTickets(guildId);
    const odds      = total > 0 ? ((myTickets / total) * 100).toFixed(1) : "0.0";

    const embed = new EmbedBuilder()
      .setColor(THEME.elite as number)
      .setAuthor({ name: `🎰  Neural Lottery  ·  ${BOT_NAME}` })
      .setDescription(`> *Every ticket costs 🪙 **${TICKET_PRICE.toLocaleString()}** coins. One winner takes the pot.*\n${SEP}`)
      .addFields(
        { name: "◈ Jackpot",    value: `🪙 ${state.pot.toLocaleString()} coins`,               inline: true },
        { name: "◈ Draw In",    value: `<t:${Math.floor(state.endsAt.getTime() / 1000)}:R>`,   inline: true },
        { name: "◈ Your Tickets", value: `${myTickets}x (${odds}% odds)`,                      inline: true },
      )
      .setFooter({ text: `${BOT_NAME} ◆ Neural Lottery  ·  Use /lottery buy to enter` });

    if (state.lastWinnerId) {
      embed.addFields({
        name:   "◈ Last Winner",
        value:  `<@${state.lastWinnerId}>  —  🪙 ${(state.lastWonAmount ?? 0).toLocaleString()} coins  ·  <t:${Math.floor((state.lastDrawAt?.getTime() ?? 0) / 1000)}:R>`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // ── /lottery draw (admin) ────────────────────────────────────────────────────
  if (sub === "draw") {
    await interaction.deferReply();
    const { winnerId, payout } = await drawLottery(guildId);

    if (!winnerId) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(THEME.muted).setDescription(`> No tickets were sold — draw cancelled. Pot rolled over.`)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.elite as number)
          .setAuthor({ name: `🎰  LOTTERY DRAW  ·  ${BOT_NAME}` })
          .setDescription(`${SEP}\n🏆  **Winner: <@${winnerId}>**\n💰  **Payout: ${payout.toLocaleString()} coins**\n${SEP}`)
          .setFooter({ text: `Next draw in ${LOTTERY_DAYS} days  ·  ${BOT_NAME} ◆ Neural Lottery` })
          .setTimestamp(),
      ],
    });
  }
}

// ── Scheduler hook ────────────────────────────────────────────────────────────
export async function checkLotteryDraws(client: Client) {
  const states = await db.select().from(lotteryStateTable);
  const now    = new Date();

  for (const state of states) {
    if (state.endsAt <= now && state.pot > 0) {
      const { winnerId, payout } = await drawLottery(state.guildId);
      if (!winnerId) continue;

      try {
        const guild = await client.guilds.fetch(state.guildId);
        const guildConfig = await db.select().from(lotteryStateTable).where(eq(lotteryStateTable.guildId, state.guildId));
        const embed = new EmbedBuilder()
          .setColor(THEME.elite as number)
          .setAuthor({ name: `🎰  NEURAL LOTTERY DRAW  ·  ${BOT_NAME}` })
          .setDescription(`${SEP}\n🏆  **Winner: <@${winnerId}>**\n💰  **Payout: 🪙 ${payout.toLocaleString()} coins**\n${SEP}\n> Use \`/lottery buy\` to enter the next round!`)
          .setTimestamp();

        const channels = guild.channels.cache.filter((c) => c.isTextBased() && (c as any).permissionsFor?.(guild.members.me!)?.has("SendMessages"));
        const channel  = channels.first();
        if (channel && channel.isTextBased()) {
          await (channel as any).send({ embeds: [embed] });
        }
      } catch {}
    }
  }
}
