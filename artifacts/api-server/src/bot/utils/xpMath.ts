// Pure XP/level math — no imports from db or discord.js

export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(totalXp: number): number {
  let level = 0;
  let cumulative = 0;
  while (cumulative + xpForLevel(level) <= totalXp) {
    cumulative += xpForLevel(level);
    level++;
  }
  return level;
}

export function xpProgressInLevel(totalXp: number): { current: number; needed: number } {
  let cumulative = 0;
  let level = 0;
  while (cumulative + xpForLevel(level) <= totalXp) {
    cumulative += xpForLevel(level);
    level++;
  }
  return { current: totalXp - cumulative, needed: xpForLevel(level) };
}

export function progressBar(current: number, total: number, length = 14): string {
  const filled = Math.round((current / total) * length);
  return `[${"█".repeat(filled)}${"░".repeat(length - filled)}]`;
}
