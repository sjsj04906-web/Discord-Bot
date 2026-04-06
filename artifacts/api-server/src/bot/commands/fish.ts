import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastFish } from "../db.js";

const FISH_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const CATCHES = [
  { name: "Glitch Byte",        emoji: "🐡", min: 5,    max: 20,   weight: 35, rarity: "Common"    },
  { name: "Neon Carp",          emoji: "🐠", min: 20,   max: 60,   weight: 28, rarity: "Common"    },
  { name: "Circuit Eel",        emoji: "🐍", min: 60,   max: 120,  weight: 18, rarity: "Uncommon"  },
  { name: "Corrupted Salmon",   emoji: "🐟", min: 100,  max: 200,  weight: 10, rarity: "Uncommon"  },
  { name: "Phantom Shark",      emoji: "🦈", min: 200,  max: 400,  weight: 6,  rarity: "Rare"      },
  { name: "Data Leviathan",     emoji: "🐳", min: 400,  max: 750,  weight: 2,  rarity: "Epic"      },
  { name: "Quantum Koi",        emoji: "✨", min: 750,  max: 1500, weight: 1,  rarity: "Legendary" },
];

const JUNK = [
  "an old Ethernet cable",
  "a corrupted data chip",
  "someone's lost keyfob",
  "a waterlogged terminal",
  "a broken drone wing",
];

const RARITY_COLORS: Record<string, number> = {
  Common:    0x9B9B9B,
  Uncommon:  0x2ECC71,
  Rare:      0x3498DB,
  Epic:      0x9B59B6,
  Legendary: 0xFFD700,
};

function pickCatch() {
  const total = CATCHES.reduce((a, c) => a + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CATCHES) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return CATCHES[0]!;
}

export const data = new SlashCommandBuilder()
  .setName("fish")
  .setDescription("Cast your line into the digital ocean");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  const now = Date.now();
  if (eco.lastFish && now - eco.lastFish.getTime() < FISH_COOLDOWN_MS) {
    const next = eco.lastFish.getTime() + FISH_COOLDOWN_MS;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`🎣 The waters are still. Come back <t:${Math.floor(next / 1000)}:R>!`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  // 10% junk chance
  if (Math.random() < 0.10) {
    const junk = JUNK[Math.floor(Math.random() * JUNK.length)]!;
    await updateLastFish(interaction.guild.id, interaction.user.id);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.muted)
          .setAuthor({ name: `🎣  Fishing  ·  ${BOT_NAME}` })
          .setDescription(`You reeled in... **${junk}**.\nBetter luck next time, choom.`)
          .setFooter({ text: `Next cast available in 2 hours` }),
      ],
    });
    return;
  }

  const catch_ = pickCatch();
  const earned = Math.floor(Math.random() * (catch_.max - catch_.min + 1)) + catch_.min;

  await updateLastFish(interaction.guild.id, interaction.user.id);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, earned);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(RARITY_COLORS[catch_.rarity]!)
        .setAuthor({ name: `🎣  Fishing  ·  ${BOT_NAME}` })
        .setDescription(`${catch_.emoji} You caught a **${catch_.name}**!`)
        .addFields(
          { name: "Rarity",      value: catch_.rarity,                       inline: true },
          { name: "Sold For",    value: `+${earned.toLocaleString()} ${em}`, inline: true },
          { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`,  inline: true },
        )
        .setFooter({ text: `Next cast available in 2 hours` })
        .setTimestamp(),
    ],
  });
}
