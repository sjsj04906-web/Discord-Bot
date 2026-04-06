import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { addBalance } from "../db.js";
import { db, userQuestsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

// ── Quest pool ────────────────────────────────────────────────────────────────
export type QuestType =
  | "fish"
  | "work"
  | "gamble_win"
  | "gamble_play"
  | "duel_win"
  | "duel_play"
  | "rob_attempt"
  | "daily"
  | "heist"
  | "earn_coins";

interface QuestTemplate {
  type:        QuestType;
  label:       string;
  targetRange: [number, number];
  coinRange:   [number, number];
  xpRange:     [number, number];
  description: (target: number) => string;
}

const QUEST_POOL: QuestTemplate[] = [
  {
    type:        "fish",
    label:       "🎣  Cast the Net",
    targetRange: [3, 8],
    coinRange:   [500, 1_500],
    xpRange:     [100, 300],
    description: (n) => `Use \`/fish\` ${n} time${n > 1 ? "s" : ""}.`,
  },
  {
    type:        "work",
    label:       "💼  Put In the Hours",
    targetRange: [2, 5],
    coinRange:   [600, 1_200],
    xpRange:     [80, 200],
    description: (n) => `Use \`/work\` ${n} time${n > 1 ? "s" : ""}.`,
  },
  {
    type:        "gamble_win",
    label:       "🎰  Beat the House",
    targetRange: [1, 3],
    coinRange:   [800, 2_000],
    xpRange:     [150, 350],
    description: (n) => `Win ${n} gamble${n > 1 ? "s" : ""} (any mode).`,
  },
  {
    type:        "gamble_play",
    label:       "🃏  Hit the Tables",
    targetRange: [3, 6],
    coinRange:   [400, 1_000],
    xpRange:     [60, 180],
    description: (n) => `Play ${n} gamble round${n > 1 ? "s" : ""} (any result).`,
  },
  {
    type:        "duel_win",
    label:       "⚔️  Neural Duelist",
    targetRange: [1, 2],
    coinRange:   [1_000, 2_500],
    xpRange:     [200, 500],
    description: (n) => `Win ${n} duel${n > 1 ? "s" : ""}.`,
  },
  {
    type:        "duel_play",
    label:       "🏟️  Enter the Arena",
    targetRange: [2, 4],
    coinRange:   [500, 1_200],
    xpRange:     [100, 250],
    description: (n) => `Participate in ${n} duel${n > 1 ? "s" : ""}.`,
  },
  {
    type:        "rob_attempt",
    label:       "🕵️  Ghost Protocol",
    targetRange: [1, 3],
    coinRange:   [700, 1_800],
    xpRange:     [120, 300],
    description: (n) => `Attempt ${n} rob${n > 1 ? "s" : ""} (win or lose).`,
  },
  {
    type:        "daily",
    label:       "📅  System Uptime",
    targetRange: [1, 1],
    coinRange:   [300, 800],
    xpRange:     [50, 150],
    description: () => `Claim your \`/daily\` reward.`,
  },
  {
    type:        "heist",
    label:       "🏦  Grid Infiltration",
    targetRange: [1, 1],
    coinRange:   [1_500, 3_000],
    xpRange:     [300, 600],
    description: () => `Join or start a \`/heist\`.`,
  },
  {
    type:        "earn_coins",
    label:       "🪙  Coin Harvester",
    targetRange: [1_000, 5_000],
    coinRange:   [600, 1_500],
    xpRange:     [100, 250],
    description: (n) => `Earn ${n.toLocaleString()} coins from any source.`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }

function pickThreeQuests(): Array<{ template: QuestTemplate; target: number; coins: number; xp: number }> {
  const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((t) => ({
    template: t,
    target:   rand(t.targetRange[0], t.targetRange[1]),
    coins:    rand(t.coinRange[0],   t.coinRange[1]),
    xp:       rand(t.xpRange[0],     t.xpRange[1]),
  }));
}

async function generateQuestsForUser(guildId: string, userId: string) {
  const expiresAt = new Date();
  expiresAt.setUTCHours(24, 0, 0, 0); // midnight UTC

  const quests = pickThreeQuests();
  for (const q of quests) {
    await db.insert(userQuestsTable).values({
      guildId,
      userId,
      questType:   q.template.type,
      label:       q.template.label,
      target:      q.target,
      progress:    0,
      rewardCoins: q.coins,
      rewardXp:    q.xp,
      expiresAt,
    });
  }
}

export async function getActiveQuests(guildId: string, userId: string) {
  const now = new Date();
  return db
    .select()
    .from(userQuestsTable)
    .where(
      and(
        eq(userQuestsTable.guildId, guildId),
        eq(userQuestsTable.userId, userId),
        gt(userQuestsTable.expiresAt, now),
      )
    );
}

// ── Progress tracker ──────────────────────────────────────────────────────────
export async function incrementQuestProgress(guildId: string, userId: string, type: QuestType, amount = 1) {
  const quests = await getActiveQuests(guildId, userId);
  const now    = new Date();

  for (const q of quests) {
    if (q.questType !== type)    continue;
    if (q.completedAt !== null)  continue;

    const newProgress = Math.min(q.progress + amount, q.target);
    const completed   = newProgress >= q.target;

    await db.update(userQuestsTable)
      .set({
        progress:    newProgress,
        completedAt: completed ? now : null,
      })
      .where(eq(userQuestsTable.id, q.id));

    if (completed) {
      await addBalance(guildId, userId, q.rewardCoins);
      try {
        const { addXp } = await import("../db.js");
        await addXp(guildId, userId, q.rewardXp);
      } catch {}
    }
  }
}

// ── Slash command ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("quests")
  .setDescription("View your daily quest board — 3 objectives that reset at midnight UTC.");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;

  let quests = await getActiveQuests(guildId, userId);

  if (quests.length === 0) {
    await generateQuestsForUser(guildId, userId);
    quests = await getActiveQuests(guildId, userId);
  }

  const resetTs = quests[0]?.expiresAt ?? new Date();

  const fields = quests.map((q) => {
    const done     = q.completedAt !== null;
    const bar      = buildBar(q.progress, q.target);
    const status   = done ? "✅" : "◈";
    const template = QUEST_POOL.find((t) => t.type === q.questType);
    const desc     = template?.description(q.target) ?? q.label;

    return {
      name:   `${status}  ${q.label}`,
      value:  `> ${desc}\n> ${bar}  ${q.progress}/${q.target}\n> 🪙 **${q.rewardCoins.toLocaleString()}**  ·  ⚡ **${q.rewardXp} XP**`,
      inline: false,
    };
  });

  const completed = quests.filter((q) => q.completedAt !== null).length;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(completed === 3 ? THEME.success : THEME.xp as number)
        .setAuthor({ name: `📋  Daily Quest Board  ·  ${BOT_NAME}` })
        .setDescription(`> Complete all 3 objectives before midnight UTC to earn bonus coins & XP.\n${SEP}`)
        .addFields(...fields)
        .setFooter({ text: `${completed}/3 complete  ·  Resets <t:${Math.floor(resetTs.getTime() / 1000)}:R>  ·  ${BOT_NAME} ◆ Quests` }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function buildBar(progress: number, target: number, width = 10): string {
  const filled = Math.round((progress / target) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
