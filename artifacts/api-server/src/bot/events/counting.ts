import { type Message, EmbedBuilder } from "discord.js";
import { db } from "@workspace/db";
import { countingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { THEME, BOT_NAME } from "../theme.js";

// ── In-memory cache so we don't hit the DB on every message ───────────────
interface CountState {
  channelId:    string;
  currentCount: number;
  lastUserId:   string;
  highScore:    number;
}
const cache = new Map<string, CountState | null>(); // guildId → state (null = disabled)

async function getState(guildId: string): Promise<CountState | null> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  const rows = await db.select().from(countingTable).where(eq(countingTable.guildId, guildId));
  const state = rows[0] && rows[0].channelId ? rows[0] as CountState : null;
  cache.set(guildId, state);
  return state;
}

async function saveState(guildId: string, state: CountState): Promise<void> {
  cache.set(guildId, state);
  await db
    .insert(countingTable)
    .values({ guildId, ...state })
    .onConflictDoUpdate({
      target: countingTable.guildId,
      set: {
        currentCount: state.currentCount,
        lastUserId:   state.lastUserId,
        highScore:    state.highScore,
      },
    });
}

// ── Called by the message event ────────────────────────────────────────────
export async function handleCounting(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const state = await getState(message.guild.id);
  if (!state || state.channelId !== message.channel.id) return;

  const num = parseInt(message.content.trim(), 10);

  // Delete message and warn if it's not a clean number
  if (isNaN(num) || message.content.trim() !== String(num)) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `❌ Only numbers allowed in the counting channel, ${message.author}! The count is at **${state.currentCount}**.`,
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  // Same user counted twice in a row
  if (message.author.id === state.lastUserId) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `❌ You can't count twice in a row, ${message.author}! Wait for someone else. Count is at **${state.currentCount}**.`,
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  const expected = state.currentCount + 1;

  if (num !== expected) {
    // Wrong number — reset count
    const oldCount = state.currentCount;
    state.currentCount = 0;
    state.lastUserId   = "";
    await saveState(message.guild.id, state);

    await message.react("❌").catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(THEME.danger)
      .setAuthor({ name: `💥  Count Ruined!  ·  ${BOT_NAME}` })
      .setDescription(
        `${message.author} ruined the count at **${oldCount}** by saying **${num}** instead of **${expected}**.\n\nStart again from **1**.`,
      )
      .setFooter({ text: `High score: ${state.highScore}` })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => {});
    return;
  }

  // ✅ Correct number
  state.currentCount = num;
  state.lastUserId   = message.author.id;
  if (num > state.highScore) state.highScore = num;
  await saveState(message.guild.id, state);

  await message.react("✅").catch(() => {});

  // Milestone messages at round numbers
  if (num % 100 === 0) {
    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🎉  Milestone Reached!  ·  ${BOT_NAME}` })
      .setDescription(`${message.author} hit **${num}**! Keep it going!`)
      .setFooter({ text: `High score: ${state.highScore}` })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] }).catch(() => {});
  }
}

// ── Helpers exported for the counting command ──────────────────────────────
export async function setupCounting(guildId: string, channelId: string): Promise<void> {
  const state: CountState = { channelId, currentCount: 0, lastUserId: "", highScore: 0 };
  cache.set(guildId, state);
  await db
    .insert(countingTable)
    .values({ guildId, ...state })
    .onConflictDoUpdate({
      target: countingTable.guildId,
      set: { channelId, currentCount: 0, lastUserId: "", highScore: 0 },
    });
}

export async function resetCounting(guildId: string): Promise<number> {
  const state = await getState(guildId);
  if (!state) return 0;
  const old = state.currentCount;
  state.currentCount = 0;
  state.lastUserId   = "";
  await saveState(guildId, state);
  return old;
}

export async function disableCounting(guildId: string): Promise<void> {
  cache.set(guildId, null);
  await db
    .insert(countingTable)
    .values({ guildId, channelId: "", currentCount: 0, lastUserId: "", highScore: 0 })
    .onConflictDoUpdate({ target: countingTable.guildId, set: { channelId: "" } });
}

export async function getCountingState(guildId: string): Promise<CountState | null> {
  return getState(guildId);
}
