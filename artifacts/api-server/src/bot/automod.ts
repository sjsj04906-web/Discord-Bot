import {
  type Message,
  PermissionFlagsBits,
  type TextChannel,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { log } from "./display.js";
import { warnings } from "./warnings.js";
import { sendModLog } from "./modlog.js";

// ─── Thresholds ───────────────────────────────────────────────────────────────
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 5000;
const CAPS_THRESHOLD = 0.75;
const CAPS_MIN_LENGTH = 12;
const MAX_MENTIONS = 4;
const REPEAT_CHAR_THRESHOLD = 8;
const DUPLICATE_WINDOW_MS = 10000;
const DUPLICATE_THRESHOLD = 3;

// Auto-escalation: warn count → action
const ESCALATION: Array<{ warns: number; action: "mute" | "ban"; duration?: number; label: string }> = [
  { warns: 3, action: "mute", duration: 10 * 60 * 1000, label: "10 min mute" },
  { warns: 5, action: "mute", duration: 60 * 60 * 1000, label: "1 hour mute" },
  { warns: 8, action: "ban",  label: "permanent ban" },
];

// ─── State ────────────────────────────────────────────────────────────────────
const spamTracker = new Map<string, { count: number; lastMessage: number }>();
const duplicateTracker = new Map<string, { content: string; count: number; lastMessage: number }>();

// ─── Bad word list ─────────────────────────────────────────────────────────────
const SLUR_PATTERNS = [
  /\bn+i+g+[ae]r*s?\b/i,
  /\bf+a+g+o*t+s?\b/i,
  /\br+e+t+a+r+d+s?\b/i,
  /\bc+h+i+n+k+s?\b/i,
  /\bs+p+i+c+s?\b/i,
  /\bk+y+k+e+s?\b/i,
  /\bc+o+o+n+s?\b/i,
  /\bs+p+a+z+z*s?\b/i,
];

// ─── Phishing / malicious domains ─────────────────────────────────────────────
const PHISHING_DOMAINS = [
  "discord-nitro", "free-nitro", "discordgift", "steam-community",
  "steamcommunity-trade", "discordapp.gift", "dlscord", "d1scord",
  "discord.gift.com", "free-steam", "nitro-gift",
];

// ─── Discord invite pattern ────────────────────────────────────────────────────
const INVITE_PATTERN = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9]+/i;

// ─── Zalgo detection ──────────────────────────────────────────────────────────
const ZALGO_PATTERN = /[\u0300-\u036f\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/;

// ─── Repeated character detection ─────────────────────────────────────────────
const REPEAT_CHAR_PATTERN = new RegExp(`(.)\\1{${REPEAT_CHAR_THRESHOLD},}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function containsSlur(content: string): boolean {
  return SLUR_PATTERNS.some((p) => p.test(content));
}

function containsInvite(content: string): boolean {
  return INVITE_PATTERN.test(content);
}

function containsPhishing(content: string): boolean {
  const lower = content.toLowerCase();
  return PHISHING_DOMAINS.some((d) => lower.includes(d));
}

function isZalgo(content: string): boolean {
  return ZALGO_PATTERN.test(content);
}

function hasRepeatedChars(content: string): boolean {
  return REPEAT_CHAR_PATTERN.test(content);
}

function isExcessiveCaps(content: string): boolean {
  if (content.length < CAPS_MIN_LENGTH) return false;
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= CAPS_THRESHOLD;
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
  return entry.count >= SPAM_THRESHOLD;
}

function isDuplicateSpam(userId: string, content: string): boolean {
  const now = Date.now();
  const normalized = content.trim().toLowerCase();
  const entry = duplicateTracker.get(userId);
  if (!entry || now - entry.lastMessage > DUPLICATE_WINDOW_MS || entry.content !== normalized) {
    duplicateTracker.set(userId, { content: normalized, count: 1, lastMessage: now });
    return false;
  }
  entry.count++;
  entry.lastMessage = now;
  return entry.count >= DUPLICATE_THRESHOLD;
}

function hasExcessiveMentions(message: Message): boolean {
  return message.mentions.users.size + message.mentions.roles.size > MAX_MENTIONS;
}

// ─── Escalation ───────────────────────────────────────────────────────────────
async function checkEscalation(message: Message, warningCount: number): Promise<void> {
  const step = ESCALATION.find((e) => e.warns === warningCount);
  if (!step || !message.guild) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;

  try {
    if (step.action === "mute" && step.duration && member.moderatable) {
      await member.timeout(step.duration, `Auto-mod escalation: ${warningCount} warnings`);
    } else if (step.action === "ban" && member.bannable) {
      await message.guild.members.ban(message.author, {
        reason: `Auto-mod escalation: ${warningCount} warnings`,
      });
    }

    log.escalate(message.author.tag, message.guild.name, step.label, warningCount);

    await sendModLog(message.guild, {
      action: `🚨 Auto-Escalation: ${step.label.toUpperCase()}`,
      color: step.action === "ban" ? Colors.DarkRed : Colors.Orange,
      target: message.author,
      moderator: message.client.user!,
      reason: `Reached ${warningCount} auto-mod warnings`,
    });
  } catch {
    // member left or missing permissions
  }
}

// ─── Warning embed ────────────────────────────────────────────────────────────
function buildAutomodEmbed(user: string, violations: string[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle("⚠️ Message Removed")
    .setDescription(`${user}, your message was removed.`)
    .addFields({ name: "Reason", value: violations.map((v) => `• ${v}`).join("\n") })
    .setFooter({ text: "Repeated violations will result in automatic moderation actions." })
    .setTimestamp();
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleAutoMod(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const content = message.content;
  const violations: string[] = [];

  if (containsSlur(content))         violations.push("Hate speech / slurs");
  if (containsInvite(content))        violations.push("Unauthorized Discord invite");
  if (containsPhishing(content))      violations.push("Phishing / malicious link");
  if (isZalgo(content))               violations.push("Zalgo / distorted text");
  if (hasRepeatedChars(content))      violations.push("Repeated characters");
  if (isExcessiveCaps(content))       violations.push("Excessive caps");
  if (hasExcessiveMentions(message))  violations.push("Mass mentions");
  if (isSpam(message.author.id))      violations.push("Message spam");
  if (isDuplicateSpam(message.author.id, content)) violations.push("Repeated messages");

  if (violations.length === 0) return;

  const primaryViolation = violations[0]!;
  log.automod(primaryViolation, message.author.tag, message.guild.name, content);

  try {
    await message.delete();
  } catch {
    return;
  }

  const key = `${message.guild.id}:${message.author.id}`;
  const existing = warnings.get(key) ?? [];
  existing.push({
    reason: `[Auto-mod] ${violations.join(", ")}`,
    moderator: "Guardian Bot",
    timestamp: new Date().toISOString(),
  });
  warnings.set(key, existing);

  const channel = message.channel as TextChannel;
  try {
    const notice = await channel.send({
      embeds: [buildAutomodEmbed(`<@${message.author.id}>`, violations)],
    });
    setTimeout(() => notice.delete().catch(() => {}), 10000);
  } catch {
    // channel may not be writable
  }

  await sendModLog(message.guild, {
    action: "🛡️ Auto-Mod Action",
    color: Colors.Yellow,
    target: message.author,
    moderator: message.client.user!,
    reason: violations.join(", "),
    extra: { "Warning #": String(existing.length) },
  });

  await checkEscalation(message, existing.length);
}
