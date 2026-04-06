import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { BOT_NAME } from "../theme.js";
import { getGuildConfig, addBalance, incrementFishCount } from "../db.js";
import { checkAndAward } from "../lib/achievements.js";

const CATCHES = [
  { name: "Glitch Byte",      emoji: "🐡", min: 5,    max: 20,   weight: 35, rarity: "Common"    },
  { name: "Neon Carp",        emoji: "🐠", min: 20,   max: 60,   weight: 28, rarity: "Common"    },
  { name: "Circuit Eel",      emoji: "🐍", min: 60,   max: 120,  weight: 18, rarity: "Uncommon"  },
  { name: "Corrupted Salmon", emoji: "🐟", min: 100,  max: 200,  weight: 10, rarity: "Uncommon"  },
  { name: "Phantom Shark",    emoji: "🦈", min: 200,  max: 400,  weight: 6,  rarity: "Rare"      },
  { name: "Data Leviathan",   emoji: "🐳", min: 400,  max: 750,  weight: 2,  rarity: "Epic"      },
  { name: "Quantum Koi",      emoji: "✨", min: 750,  max: 1500, weight: 1,  rarity: "Legendary" },
];

const JUNK = [
  "an old Ethernet cable",
  "a corrupted data chip",
  "someone's lost keyfob",
  "a waterlogged terminal",
  "a broken drone wing",
  "a ghost-encrypted hard drive",
  "a cracked neural interface",
];

const RARITY_COLORS: Record<string, number> = {
  Common:    0x607D8B,
  Uncommon:  0x00897B,
  Rare:      0x1565C0,
  Epic:      0x6A1B9A,
  Legendary: 0xFFB703,
};

const RARITY_LABEL: Record<string, string> = {
  Common:    "◈ Common",
  Uncommon:  "◈◈ Uncommon",
  Rare:      "◈◈◈ Rare",
  Epic:      "◈◈◈◈ Epic",
  Legendary: "◈◈◈◈◈ Legendary",
};

const LEGENDARY_LINES = [
  "The signal sang before you pulled it up.",
  "A ghost in the deep — yours now.",
  "The grid falls silent. Everyone felt that catch.",
];

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
  .setDescription("Cast your line into the digital deep");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const em     = config.currencyEmoji;

  await interaction.deferReply();

  // 10% junk chance
  if (Math.random() < 0.10) {
    const junk = JUNK[Math.floor(Math.random() * JUNK.length)]!;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2D2B55)
          .setAuthor({ name: `🎣  Deep Water Fishing  ·  ${BOT_NAME}` })
          .setDescription(`You reeled in **${junk}**.\n> *Not everything in the deep is worth keeping, choom.*`)
          .setFooter({ text: `${BOT_NAME}  ◆  Economy` }),
      ],
    });
    return;
  }

  // Market buffs
  const { hasActiveItem, consumeActiveItem } = await import("./market.js");
  const hasFishLure   = await hasActiveItem(interaction.guild.id, interaction.user.id, "fish_lure");
  const hasCoinMagnet = await hasActiveItem(interaction.guild.id, interaction.user.id, "coin_magnet");

  // Quantum Lure — reroll once and keep the rarer result
  let catch_ = pickCatch();
  if (hasFishLure) {
    const alt = pickCatch();
    const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
    if (rarityOrder.indexOf(alt.rarity) > rarityOrder.indexOf(catch_.rarity)) catch_ = alt;
    consumeActiveItem(interaction.guild.id, interaction.user.id, "fish_lure").catch(() => {});
  }

  let earned  = Math.floor(Math.random() * (catch_.max - catch_.min + 1)) + catch_.min;
  // Coin Magnet — +50 % yield
  if (hasCoinMagnet) earned = Math.floor(earned * 1.5);
  const isLegend = catch_.rarity === "Legendary";

  await incrementFishCount(interaction.guild.id, interaction.user.id);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, earned);
  checkAndAward(interaction.guild.id, interaction.user.id, interaction.channel as never, em).catch(() => {});
  (await import("./quests.js")).incrementQuestProgress(interaction.guild.id, interaction.user.id, "fish").catch(() => {});
  (await import("./quests.js")).incrementQuestProgress(interaction.guild.id, interaction.user.id, "earn_coins", earned).catch(() => {});

  const flavor = isLegend
    ? `\n> *${LEGENDARY_LINES[Math.floor(Math.random() * LEGENDARY_LINES.length)]}*`
    : "";

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(RARITY_COLORS[catch_.rarity]!)
        .setAuthor({ name: `🎣  Deep Water Fishing  ·  ${BOT_NAME}` })
        .setDescription(`${catch_.emoji}  **${catch_.name}** — hauled from the digital deep.${flavor}`)
        .addFields(
          { name: "Rarity",    value: RARITY_LABEL[catch_.rarity]!,           inline: true },
          { name: "Sold For",  value: `**+${earned.toLocaleString()}** ${em}`, inline: true },
          { name: "Balance",   value: `${newBal.toLocaleString()} ${em}`,      inline: true },
        )
        .setFooter({ text: `${BOT_NAME}  ◆  Economy` })
        .setTimestamp(),
    ],
  });
}
