import { EmbedBuilder, type Client, type TextChannel, type DMChannel, type NewsChannel, type ThreadChannel } from "discord.js";
import type { EconomyUser } from "@workspace/db";
import { getBalance, getUnlockedAchievements, unlockAchievement, addBalance, getAllEconomyRows } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { logger } from "../../lib/logger.js";

export interface AchievementDef {
  id:     string;
  emoji:  string;
  name:   string;
  desc:   string;
  reward: number;
  check:  (eco: EconomyUser) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Fishing ──────────────────────────────────────────────────────────────
  { id: "first_catch",  emoji: "🎣", name: "First Cast",       desc: "Catch your first fish",         reward: 50,    check: (e) => e.fishCount >= 1   },
  { id: "angler_50",    emoji: "🐟", name: "Seasoned Angler",  desc: "Catch 50 fish",                 reward: 500,   check: (e) => e.fishCount >= 50  },
  { id: "angler_500",   emoji: "🐋", name: "Deep Sea Legend",  desc: "Catch 500 fish",                reward: 5_000, check: (e) => e.fishCount >= 500 },
  // ── Total earned ─────────────────────────────────────────────────────────
  { id: "earn_1k",      emoji: "💸", name: "Pocket Change",    desc: "Earn 1,000 coins total",        reward: 100,    check: (e) => e.totalEarned >= 1_000     },
  { id: "earn_100k",    emoji: "💰", name: "Stacking Paper",   desc: "Earn 100,000 coins total",      reward: 2_500,  check: (e) => e.totalEarned >= 100_000   },
  { id: "earn_1m",      emoji: "🏆", name: "Millionaire",      desc: "Earn 1,000,000 coins total",    reward: 25_000, check: (e) => e.totalEarned >= 1_000_000 },
  // ── Net worth ─────────────────────────────────────────────────────────────
  { id: "worth_10k",    emoji: "💼", name: "Getting There",    desc: "Reach a net worth of 10,000",   reward: 200,   check: (e) => e.balance + e.bankBalance >= 10_000  },
  { id: "worth_100k",   emoji: "🤑", name: "Big Baller",       desc: "Reach a net worth of 100,000",  reward: 5_000, check: (e) => e.balance + e.bankBalance >= 100_000 },
  // ── Daily streak ──────────────────────────────────────────────────────────
  { id: "streak_7",     emoji: "🔥", name: "On Fire",          desc: "Hit a 7-day daily streak",      reward: 350,   check: (e) => e.dailyStreak >= 7  },
  { id: "streak_30",    emoji: "⚡", name: "Dedicated",        desc: "Hit a 30-day daily streak",     reward: 3_000, check: (e) => e.dailyStreak >= 30 },
  // ── Crime ────────────────────────────────────────────────────────────────
  { id: "first_rob",    emoji: "🦹", name: "First Score",      desc: "Successfully rob someone",      reward: 100,   check: (e) => e.robSuccesses >= 1  },
  { id: "rob_10",       emoji: "😈", name: "Career Criminal",  desc: "Rob 10 people successfully",    reward: 1_000, check: (e) => e.robSuccesses >= 10 },
  // ── Blackjack ────────────────────────────────────────────────────────────
  { id: "bj_win_1",     emoji: "🃏", name: "Card Shark",       desc: "Win your first blackjack hand", reward: 100,   check: (e) => e.bjWins >= 1  },
  { id: "bj_win_25",    emoji: "♠️", name: "House Beater",     desc: "Win 25 blackjack hands",        reward: 2_500, check: (e) => e.bjWins >= 25 },
  // ── Heist ────────────────────────────────────────────────────────────────
  { id: "heist_1",      emoji: "🏴‍☠️", name: "Crew Up",       desc: "Participate in your first heist", reward: 200,   check: (e) => e.heistCount >= 1  },
  { id: "heist_10",     emoji: "🎭", name: "Heist Master",     desc: "Participate in 10 heists",      reward: 2_000, check: (e) => e.heistCount >= 10 },
  // ── Banking ──────────────────────────────────────────────────────────────
  { id: "first_deposit", emoji: "🏦", name: "Safety First",   desc: "Make your first bank deposit",  reward: 50,    check: (e) => e.bankBalance >= 1 },
];

type SendableChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

export async function runRetroactiveCheck(client: Client, currencyEmoji = "🪙"): Promise<void> {
  logger.info("Running retroactive achievement check…");
  let awarded = 0;
  let users   = 0;

  try {
    const rows = await getAllEconomyRows();

    for (const eco of rows) {
      const unlocked    = await getUnlockedAchievements(eco.guildId, eco.userId);
      const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
      const newlyEarned: AchievementDef[] = [];

      for (const ach of ACHIEVEMENTS) {
        if (unlockedIds.has(ach.id)) continue;
        if (!ach.check(eco)) continue;

        await unlockAchievement(eco.guildId, eco.userId, ach.id);
        if (ach.reward > 0) await addBalance(eco.guildId, eco.userId, ach.reward);
        newlyEarned.push(ach);
        awarded++;
      }

      if (newlyEarned.length === 0) continue;
      users++;

      const totalReward = newlyEarned.reduce((s, a) => s + a.reward, 0);
      const lines       = newlyEarned.map((a) => `${a.emoji} **${a.name}** — ${a.desc}  (+${a.reward.toLocaleString()} ${currencyEmoji})`).join("\n");

      try {
        const dmUser = await client.users.fetch(eco.userId).catch(() => null);
        if (dmUser) {
          const embed = new EmbedBuilder()
            .setColor(THEME.success)
            .setAuthor({ name: `🏅  Retroactive Achievements Unlocked!  ·  ${BOT_NAME}` })
            .setDescription(`You qualified for these achievements before the system launched:\n\n${lines}`)
            .addFields({ name: "Total Bonus", value: `+${totalReward.toLocaleString()} ${currencyEmoji}`, inline: true })
            .setFooter({ text: "Coins have been added to your wallet" })
            .setTimestamp();

          await dmUser.send({ embeds: [embed] }).catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    logger.error({ err }, "Retroactive achievement check failed");
  }

  logger.info({ awarded, users }, "Retroactive achievement check complete");
}

export async function checkAndAward(
  guildId:       string,
  userId:        string,
  channel:       SendableChannel | null,
  currencyEmoji: string,
): Promise<void> {
  try {
    const [eco, unlocked] = await Promise.all([
      getBalance(guildId, userId),
      getUnlockedAchievements(guildId, userId),
    ]);
    const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

    for (const ach of ACHIEVEMENTS) {
      if (unlockedIds.has(ach.id)) continue;
      if (!ach.check(eco)) continue;

      await unlockAchievement(guildId, userId, ach.id);
      if (ach.reward > 0) {
        await addBalance(guildId, userId, ach.reward);
      }

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🏅  Achievement Unlocked!  ·  ${BOT_NAME}` })
          .setDescription(`<@${userId}> unlocked **${ach.emoji} ${ach.name}**\n*${ach.desc}*`)
          .addFields({ name: "Reward", value: `+${ach.reward.toLocaleString()} ${currencyEmoji}`, inline: true })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch {
  }
}
