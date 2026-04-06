import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, incrementPrestige } from "../db.js";

export const MAX_PRESTIGE   = 10;
export const PRESTIGE_REQ   = 500_000;
export const PRESTIGE_BONUS = 0.10;

interface PrestigeRank {
  badge:  string;
  title:  string;
  color:  number;
  flavor: string;
}

const RANKS: PrestigeRank[] = [
  { badge: "",    title: "Unranked",     color: 0x36393F, flavor: "" },
  { badge: "👻",  title: "Ghost",        color: 0x9B59B6, flavor: "You slipped through the first firewall undetected." },
  { badge: "💀",  title: "Phantom",      color: 0x8E44AD, flavor: "The network doesn't know you exist." },
  { badge: "🔮",  title: "Netrunner",    color: 0x2980B9, flavor: "You see the code beneath the code." },
  { badge: "⚡",  title: "Cipher",       color: 0x1ABC9C, flavor: "Encrypted. Unstoppable. Unknown." },
  { badge: "🌊",  title: "Wraith",       color: 0x00FF88, flavor: "You move through systems like water." },
  { badge: "🔥",  title: "Specter",      color: 0xFF6B35, flavor: "Corporations fear your name." },
  { badge: "🌌",  title: "Overlord",     color: 0xFF4500, flavor: "You own the net." },
  { badge: "👁️", title: "Architect",    color: 0xFF0066, flavor: "Reality is just another system to exploit." },
  { badge: "💠",  title: "Transcendent", color: 0xE040FB, flavor: "You have become something beyond human." },
  { badge: "⚜️", title: "Ascendant",    color: 0xFFD700, flavor: "Legend. Ghost. God. You are the end of the line." },
];

export function getPrestigeInfo(level: number): PrestigeRank & { level: number } {
  const idx = Math.min(Math.max(level, 0), MAX_PRESTIGE);
  return { level, ...RANKS[idx]! };
}

export function prestigeBadge(level: number): string {
  if (level <= 0) return "";
  const { badge, title } = getPrestigeInfo(level);
  return `${badge} ${title}`;
}

export const data = new SlashCommandBuilder()
  .setName("prestige")
  .setDescription(`Sacrifice your wallet to ascend — earns +${PRESTIGE_BONUS * 100}% income permanently per level`);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  const current = getPrestigeInfo(eco.prestige);

  // ── Already maxed ──────────────────────────────────────────────────────────
  if (eco.prestige >= MAX_PRESTIGE) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setAuthor({ name: `⚜️  Ascendant  ·  ${BOT_NAME}` })
          .setDescription(`> *"${current.flavor}"*\n\nYou have reached the apex. There is nowhere higher to climb.\n\n**${current.badge} ${current.title}** — Prestige ${MAX_PRESTIGE}`)
          .setFooter({ text: "You are the end of the line." })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const next = getPrestigeInfo(eco.prestige + 1);

  // ── Not enough coins ───────────────────────────────────────────────────────
  if (eco.balance < PRESTIGE_REQ) {
    const needed   = PRESTIGE_REQ - eco.balance;
    const progress = Math.floor((eco.balance / PRESTIGE_REQ) * 20);
    const bar      = `${"█".repeat(progress)}${"░".repeat(20 - progress)}`;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(next.color)
          .setAuthor({ name: `${next.badge}  Prestige ${eco.prestige + 1} · ${next.title}  ·  ${BOT_NAME}` })
          .setDescription(`> *"${next.flavor}"*\n\nYou are not ready to ascend yet.`)
          .addFields(
            { name: "Progress",    value: `\`${bar}\` ${Math.floor((eco.balance / PRESTIGE_REQ) * 100)}%`, inline: false },
            { name: "Your Wallet", value: `${eco.balance.toLocaleString()} ${em}`,    inline: true },
            { name: "Required",    value: `${PRESTIGE_REQ.toLocaleString()} ${em}`,   inline: true },
            { name: "Still Need",  value: `${needed.toLocaleString()} ${em}`,         inline: true },
          )
          .setFooter({ text: `Current rank: ${current.badge || "—"} ${current.title}` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Prestige ───────────────────────────────────────────────────────────────
  const { newBalance } = await incrementPrestige(interaction.guild.id, interaction.user.id);
  const bonus          = Math.round(next.level * PRESTIGE_BONUS * 100);
  const hasNextRank    = next.level < MAX_PRESTIGE;
  const afterNext      = hasNextRank ? getPrestigeInfo(next.level + 1) : null;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(next.color)
        .setAuthor({ name: `${next.badge}  You Have Ascended  ·  ${BOT_NAME}` })
        .setDescription(
          `> *"${next.flavor}"*\n\n` +
          `The transfer is complete. Your wallet has been wiped.\n` +
          `You are now **${next.badge} ${next.title}**.`
        )
        .addFields(
          { name: "New Rank",       value: `${next.badge} **${next.title}** (Prestige ${next.level})`, inline: false },
          { name: "Wallet Reset",   value: `${newBalance.toLocaleString()} ${em}`,                     inline: true  },
          { name: "Bank Preserved", value: `${eco.bankBalance.toLocaleString()} ${em}`,                inline: true  },
          { name: "Income Bonus",   value: `**+${bonus}%** on /work, /daily & /hourly`,                inline: false },
          ...(afterNext ? [{ name: "Next Ascension", value: `${afterNext.badge} ${afterNext.title} — requires ${PRESTIGE_REQ.toLocaleString()} ${em}`, inline: false }] : []),
        )
        .setFooter({ text: hasNextRank ? `${MAX_PRESTIGE - next.level} prestige levels remaining` : "Maximum prestige achieved — you are a legend." })
        .setTimestamp(),
    ],
  });
}
