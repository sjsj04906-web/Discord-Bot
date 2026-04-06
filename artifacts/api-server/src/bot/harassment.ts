import {
  type Message,
  PermissionFlagsBits,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "./theme.js";
import { log } from "./display.js";

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

// ─── Patterns ─────────────────────────────────────────────────────────────────

// Self-harm encouragement / "kys" variants
const KYS_PATTERNS = [
  /\bk+y+s+\b/i,
  /kill\s+(ur?|your)sel(f|ves)/i,
  /go\s+(die|kys|kill\s+yourself)/i,
  /drink\s+bleach/i,
  /end\s+(ur?|your)\s+life/i,
  /rope\s+yourself/i,
  /unalive\s+yourself/i,
  /do\s+(the\s+)?world\s+a\s+favour\s+and\s+die/i,
  /nobody\s+(wants|likes)\s+you(\s+alive)?/i,
];

// Direct threats
const THREAT_PATTERNS = [
  /i('?ll|'?\s*will|'?m\s+going\s+to)\s+(kill|hurt|harm|beat|find)\s+you/i,
  /i\s+know\s+where\s+you\s+live/i,
  /you('?re|r)\s+(dead|done|finished|going\s+to\s+pay)/i,
  /watch\s+(your|ur)\s+back/i,
  /i('?ll|'?\s*will)\s+(dox|doxx)\s+you/i,
  /sending\s+(my\s+)?boys/i,
];

// Targeted harassment slurs (broader list than the delete-worthy ones)
const SLUR_PATTERNS = [
  /\bn+i+g+[ae]r*s?\b/i,
  /\bf+a+g+o*t+s?\b/i,
  /\br+e+t+a+r+d+s?\b/i,
  /\bc+h+i+n+k+s?\b/i,
  /\bs+p+i+c+s?\b/i,
  /\bk+y+k+e+s?\b/i,
  /\bc+o+o+n+s?\b/i,
  /\btr+a+n+n+y\b/i,
  /\bsl+u+t+\b/i,
  /\bwh+o+r+e+\b/i,
  /\bc+u+n+t+\b/i,
  /\bb+i+t+c+h+\b/i,
];

// Doxxing signals
const DOXX_PATTERNS = [
  /your\s+(ip|address|location|school|house)/i,
  /found\s+your\s+(ip|address|real\s+name|location)/i,
  /i\s+(have|got)\s+your\s+(ip|address|info)/i,
];

interface HarassmentFlag {
  category: string;
  pattern: string;
}

function scan(content: string): HarassmentFlag[] {
  const flags: HarassmentFlag[] = [];
  const lower = content.toLowerCase();

  for (const p of KYS_PATTERNS) {
    if (p.test(lower)) { flags.push({ category: "Self-harm encouragement", pattern: p.source }); break; }
  }
  for (const p of THREAT_PATTERNS) {
    if (p.test(lower)) { flags.push({ category: "Direct threat", pattern: p.source }); break; }
  }
  for (const p of SLUR_PATTERNS) {
    if (p.test(content)) { flags.push({ category: "Targeted slur / hate speech", pattern: p.source }); break; }
  }
  for (const p of DOXX_PATTERNS) {
    if (p.test(lower)) { flags.push({ category: "Potential doxxing", pattern: p.source }); break; }
  }

  return flags;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function handleHarassmentDetection(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const member = message.guild.members.cache.get(message.author.id);
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const flags = scan(message.content);
  if (flags.length === 0) return;

  log.flag(message.author.tag, message.guild.name, flags[0]!.category);

  const modChannel = message.guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!modChannel) return;

  const preview = message.content.length > 800
    ? message.content.slice(0, 800) + "…"
    : message.content;

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setTitle("🚩 // HARASSMENT FLAG — MOD REVIEW NEEDED")
    .setDescription("A message was flagged for potential harassment. **It has NOT been deleted** — review and take action if needed.")
    .setThumbnail(message.author.displayAvatarURL())
    .addFields(
      { name: "AUTHOR",   value: `${message.author} \`${message.author.tag}\``, inline: true },
      { name: "CHANNEL",  value: `<#${message.channelId}>`, inline: true },
      { name: "FLAGS",    value: flags.map((f) => `\`${f.category}\``).join("\n") },
      { name: "MESSAGE",  value: `\`\`\`${preview}\`\`\`` },
    )
    .setFooter({ text: `${BOT_NAME} Harassment Detection • Message ID: ${message.id}` })
    .setTimestamp();

  const jumpButton = {
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Jump to Message",
            url: message.url,
          },
        ],
      },
    ],
  };

  await modChannel.send({ embeds: [embed], ...jumpButton }).catch(() => {});
}
