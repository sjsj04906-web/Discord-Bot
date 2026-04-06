import {
  type Message,
  PermissionFlagsBits,
  type TextChannel,
  EmbedBuilder,
} from "discord.js";
import { log } from "./display.js";
import { addWarning, countWarnings, getGuildConfig, getExemptChannelIds } from "./db.js";
import { sendModLog } from "./modlog.js";
import { THEME, BOT_NAME } from "./theme.js";

// ─── State ────────────────────────────────────────────────────────────────────
const spamTracker = new Map<string, { count: number; lastMessage: number }>();
const duplicateTracker = new Map<string, { content: string; count: number; lastMessage: number }>();

const DUPLICATE_WINDOW_MS = 10_000;
const DUPLICATE_THRESHOLD = 3;
const REPEAT_CHAR_THRESHOLD = 8;

// ─── Rule patterns ────────────────────────────────────────────────────────────
const SLUR_PATTERNS = [
  /\bn+i+g+[ae]r*s?\b/i, /\bf+a+g+o*t+s?\b/i, /\br+e+t+a+r+d+s?\b/i,
  /\bc+h+i+n+k+s?\b/i,   /\bs+p+i+c+s?\b/i,   /\bk+y+k+e+s?\b/i,
  /\bc+o+o+n+s?\b/i,
];
const PHISHING_DOMAINS = [
  "discord-nitro", "free-nitro", "discordgift", "dlscord", "d1scord", "free-steam", "nitro-gift",
];
const INVITE_PATTERN = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9]+/i;
const ZALGO_PATTERN = /[\u0300-\u036f\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/;
const REPEAT_CHAR_PATTERN = new RegExp(`(.)\\1{${REPEAT_CHAR_THRESHOLD},}`);

const ESCALATION: Array<{ warns: number; action: "mute" | "ban"; duration?: number; label: string }> = [
  { warns: 3, action: "mute", duration: 10 * 60 * 1000, label: "10 min mute" },
  { warns: 5, action: "mute", duration: 60 * 60 * 1000, label: "1 hour mute" },
  { warns: 8, action: "ban",  label: "permanent ban" },
];

// ─── Checks ───────────────────────────────────────────────────────────────────
function containsSlur(c: string) { return SLUR_PATTERNS.some((p) => p.test(c)); }
function containsInvite(c: string) { return INVITE_PATTERN.test(c); }
function containsPhishing(c: string) { const l = c.toLowerCase(); return PHISHING_DOMAINS.some((d) => l.includes(d)); }
function isZalgo(c: string) { return ZALGO_PATTERN.test(c); }
function hasRepeatedChars(c: string) { return REPEAT_CHAR_PATTERN.test(c); }

function isExcessiveCaps(content: string, threshold: number): boolean {
  if (content.length < 12) return false;
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 6) return false;
  return letters.replace(/[^A-Z]/g, "").length / letters.length >= threshold / 100;
}

function isSpam(userId: string, threshold: number): boolean {
  const now = Date.now();
  const entry = spamTracker.get(userId);
  if (!entry || now - entry.lastMessage > 5000) {
    spamTracker.set(userId, { count: 1, lastMessage: now });
    return false;
  }
  entry.count++;
  entry.lastMessage = now;
  return entry.count >= threshold;
}

function isDuplicateSpam(userId: string, content: string): boolean {
  const now = Date.now();
  const norm = content.trim().toLowerCase();
  const entry = duplicateTracker.get(userId);
  if (!entry || now - entry.lastMessage > DUPLICATE_WINDOW_MS || entry.content !== norm) {
    duplicateTracker.set(userId, { content: norm, count: 1, lastMessage: now });
    return false;
  }
  entry.count++;
  entry.lastMessage = now;
  return entry.count >= DUPLICATE_THRESHOLD;
}

function hasExcessiveMentions(message: Message, max: number): boolean {
  return message.mentions.users.size + message.mentions.roles.size > max;
}

// ─── Escalation ───────────────────────────────────────────────────────────────
async function checkEscalation(message: Message, warningCount: number): Promise<void> {
  const step = ESCALATION.find((e) => e.warns === warningCount);
  if (!step || !message.guild) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;

  try {
    if (step.action === "mute" && step.duration && member.moderatable) {
      await member.timeout(step.duration, `Auto-escalation: ${warningCount} warnings`);
    } else if (step.action === "ban" && member.bannable) {
      await message.guild.members.ban(message.author, { reason: `Auto-escalation: ${warningCount} warnings` });
    }

    log.escalate(message.author.tag, message.guild.name, step.label, warningCount);

    await sendModLog(message.guild, {
      action: `🚨 AUTO-ESCALATION // ${step.label.toUpperCase()}`,
      color: THEME.escalate,
      target: message.author,
      moderator: message.client.user!,
      reason: `Reached ${warningCount} auto-mod warnings`,
    });
  } catch { /* missing perms */ }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleAutoMod(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const config = await getGuildConfig(message.guild.id);
  const exemptIds = getExemptChannelIds(config);
  if (exemptIds.includes(message.channelId)) return;

  const content = message.content;
  const violations: string[] = [];

  if (containsSlur(content))                              violations.push("Hate speech / slurs");
  if (containsInvite(content))                             violations.push("Unauthorized server invite");
  if (containsPhishing(content))                           violations.push("Phishing / malicious link");
  if (isZalgo(content))                                    violations.push("Zalgo / corrupted text");
  if (hasRepeatedChars(content))                           violations.push("Repeated character spam");
  if (isExcessiveCaps(content, config.capsThreshold))      violations.push("Excessive caps");
  if (hasExcessiveMentions(message, config.maxMentions))   violations.push("Mass mention flood");
  if (isSpam(message.author.id, config.spamThreshold))     violations.push("Message rate spam");
  if (isDuplicateSpam(message.author.id, content))         violations.push("Duplicate message spam");

  if (violations.length === 0) return;

  log.automod(violations[0]!, message.author.tag, message.guild.name, content);

  try { await message.delete(); } catch { return; }

  await addWarning(message.guild.id, message.author.id, `[Auto-mod] ${violations.join(", ")}`, BOT_NAME);
  const total = await countWarnings(message.guild.id, message.author.id);

  const channel = message.channel as TextChannel;
  try {
    const notice = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.automod)
          .setTitle("// MESSAGE TERMINATED")
          .setDescription(`<@${message.author.id}> **Your transmission was flagged and removed.**`)
          .addFields({ name: "◈ VIOLATIONS DETECTED", value: violations.map((v) => `\`${v}\``).join("\n") })
          .setFooter({ text: `${BOT_NAME} Auto-Mod • Warning #${total} • Repeated violations trigger automatic penalties` })
          .setTimestamp(),
      ],
    });
    setTimeout(() => notice.delete().catch(() => {}), 10_000);
  } catch { /* not writable */ }

  await sendModLog(message.guild, {
    action: "🛡️ AUTO-MOD // INTERCEPT",
    color: THEME.automod,
    target: message.author,
    moderator: message.client.user!,
    reason: violations.join(", "),
    extra: { "WARNING #": String(total) },
  });

  if (config.autoEscalation) {
    await checkEscalation(message, total);
  }
}
