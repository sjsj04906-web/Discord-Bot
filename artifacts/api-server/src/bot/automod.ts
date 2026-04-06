import { type Message, PermissionFlagsBits, type TextChannel } from "discord.js";
import { logger } from "../lib/logger.js";

const spamTracker = new Map<string, { count: number; lastMessage: number }>();

const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 5000;
const CAPS_THRESHOLD = 0.7;
const CAPS_MIN_LENGTH = 10;
const MAX_MENTIONS = 5;

const BAD_WORDS = [
  "nigger", "nigga", "faggot", "retard", "chink", "spic",
];

function containsBadWord(content: string): boolean {
  const lower = content.toLowerCase();
  return BAD_WORDS.some((word) => lower.includes(word));
}

function isSpam(userId: string): boolean {
  const now = Date.now();
  const entry = spamTracker.get(userId);

  if (!entry || now - entry.lastMessage > SPAM_WINDOW_MS) {
    spamTracker.set(userId, { count: 1, lastMessage: now });
    return false;
  }

  entry.count++;
  entry.lastMessage = now;
  spamTracker.set(userId, entry);

  return entry.count >= SPAM_THRESHOLD;
}

function isExcessiveCaps(content: string): boolean {
  if (content.length < CAPS_MIN_LENGTH) return false;
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= CAPS_THRESHOLD;
}

function hasExcessiveMentions(message: Message): boolean {
  return (
    message.mentions.users.size + message.mentions.roles.size > MAX_MENTIONS
  );
}

export async function handleAutoMod(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;

  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const violations: string[] = [];

  if (containsBadWord(message.content)) {
    violations.push("hate speech / slurs");
  }

  if (isSpam(message.author.id)) {
    violations.push("spam");
  }

  if (isExcessiveCaps(message.content)) {
    violations.push("excessive caps");
  }

  if (hasExcessiveMentions(message)) {
    violations.push("excessive mentions");
  }

  if (violations.length === 0) return;

  try {
    await message.delete();
    const channel = message.channel as TextChannel;
    const warning = await channel.send(
      `⚠️ ${message.author}, your message was removed for: **${violations.join(", ")}**.`
    );
    setTimeout(() => warning.delete().catch(() => {}), 8000);
    logger.info(
      { userId: message.author.id, violations },
      "Auto-mod action taken"
    );
  } catch (err) {
    logger.error({ err }, "Failed to apply auto-mod action");
  }
}
