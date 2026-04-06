import {
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, MessageFlags, type ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, deductBalance } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("gamble")
  .setDescription("Risk your coins in various games")
  .addSubcommand((s) =>
    s.setName("coinflip")
      .setDescription("Flip a coin — double or nothing")
      .addStringOption((o) => o.setName("bet").setDescription('Amount to bet (or "all" / "max")').setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("slots")
      .setDescription("Spin the slot machine")
      .addStringOption((o) => o.setName("bet").setDescription('Amount to bet (or "all" / "max")').setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("roulette")
      .setDescription("Bet on roulette")
      .addStringOption((o) => o.setName("bet").setDescription('Amount to bet (or "all" / "max")').setRequired(true))
      .addStringOption((o) =>
        o.setName("color").setDescription("Choose red, black, or green").setRequired(true)
          .addChoices(
            { name: "🔴 Red (2×)",   value: "red"   },
            { name: "⚫ Black (2×)", value: "black" },
            { name: "🟢 Green (14×)",value: "green" },
          )
      )
  )
  .addSubcommand((s) =>
    s.setName("blackjack")
      .setDescription("Play blackjack against the dealer")
      .addStringOption((o) => o.setName("bet").setDescription('Amount to bet (or "all" / "max")').setRequired(true))
  );

// ─── Slot machine ─────────────────────────────────────────────────────────────
const REELS = ["🍒", "🍋", "🍇", "🔔", "💎", "7️⃣"];
const REEL_WEIGHTS = [30, 25, 20, 15, 7, 3];

function spinReel(): string {
  const total = REEL_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < REELS.length; i++) {
    r -= REEL_WEIGHTS[i]!;
    if (r <= 0) return REELS[i]!;
  }
  return REELS[0]!;
}

function calcSlotPayout(reels: string[], bet: number): { multiplier: number; label: string } {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === "7️⃣") return { multiplier: 50, label: "🎰 **JACKPOT!** Triple Sevens!" };
    if (a === "💎") return { multiplier: 20, label: "💎 **MEGA WIN!** Triple Diamonds!" };
    return { multiplier: 5, label: `✨ **BIG WIN!** Triple ${a}!` };
  }
  if (a === b || b === c || a === c) return { multiplier: 1.5, label: "🎯 Small win — pair!" };
  return { multiplier: 0, label: "💸 No match. Better luck next time!" };
}

// ─── Blackjack engine ─────────────────────────────────────────────────────────
interface BJGame {
  guildId:     string;
  userId:      string;
  bet:         number;
  playerCards: number[];
  dealerCards: number[];
  deck:        number[];
  expiresAt:   number;
  currencyEmoji: string;
  currencyName: string;
}

export const bjGames = new Map<string, BJGame>();

function newDeck(): number[] {
  const deck: number[] = [];
  for (let suit = 0; suit < 4; suit++)
    for (let val = 1; val <= 13; val++)
      deck.push(val);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function cardVal(v: number): number {
  if (v >= 10) return 10;
  return v;
}

function handValue(cards: number[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardVal(c);
    sum += v === 1 ? 11 : v;
    if (v === 1) aces++;
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}

function cardEmoji(v: number): string {
  const faces: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
  return faces[v] ?? String(v);
}

function renderHand(cards: number[]): string {
  return cards.map((c) => `\`${cardEmoji(c)}\``).join(" ") + ` **(${handValue(cards)})**`;
}

function bjButtons(userId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel("Hit").setStyle(ButtonStyle.Primary).setEmoji("🃏"),
    new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel("Stand").setStyle(ButtonStyle.Secondary).setEmoji("🛑"),
  );
}

export function bjEmbed(game: BJGame, status: "playing" | "bust" | "win" | "lose" | "push", em: string): EmbedBuilder {
  const pv = handValue(game.playerCards);
  const dv = handValue(game.dealerCards);

  const colorMap = { playing: 0x5865F2, bust: THEME.danger, win: THEME.success, lose: THEME.danger, push: THEME.muted };
  const titleMap = {
    playing: `🃏  Blackjack  ·  ${BOT_NAME}`,
    bust:    `💸  Bust!  ·  ${BOT_NAME}`,
    win:     `🏆  You Win!  ·  ${BOT_NAME}`,
    lose:    `💸  Dealer Wins  ·  ${BOT_NAME}`,
    push:    `🤝  Push  ·  ${BOT_NAME}`,
  };
  const resultMap = {
    playing: "",
    bust:    `You went bust! Lost **${game.bet.toLocaleString()} ${em}**.`,
    win:     pv === 21 && game.playerCards.length === 2
               ? `Blackjack! Won **${Math.floor(game.bet * 1.5).toLocaleString()} ${em}**.`
               : `You win! Won **${game.bet.toLocaleString()} ${em}**.`,
    lose:    `You lost **${game.bet.toLocaleString()} ${em}**.`,
    push:    `Tie — your bet of **${game.bet.toLocaleString()} ${em}** returned.`,
  };

  const dealerDisplay = status === "playing"
    ? `\`${cardEmoji(game.dealerCards[0]!)}\` \`?\``
    : renderHand(game.dealerCards) + (dv > 21 ? " **BUST**" : "");

  return new EmbedBuilder()
    .setColor(colorMap[status])
    .setAuthor({ name: titleMap[status] })
    .addFields(
      { name: `Your Hand ${status === "playing" ? `(${pv})` : ""}`, value: renderHand(game.playerCards) + (pv > 21 ? " **BUST**" : ""), inline: true },
      { name: `Dealer Hand`, value: dealerDisplay, inline: true },
    )
    .setDescription(resultMap[status] || null)
    .setFooter({ text: `Bet: ${game.bet.toLocaleString()} ${em}` });
}

export async function handleBlackjackButton(interaction: ButtonInteraction, action: "hit" | "stand") {
  const userId = interaction.user.id;
  const game   = bjGames.get(userId);

  if (!game || Date.now() > game.expiresAt) {
    bjGames.delete(userId);
    await interaction.reply({ content: "This game has expired.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: "This isn't your game!", flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === "hit") {
    const card = game.deck.pop()!;
    game.playerCards.push(card);
    const pv = handValue(game.playerCards);

    if (pv > 21) {
      bjGames.delete(userId);
      // Bet was already deducted at game start — no further deduction needed
      await interaction.update({ embeds: [bjEmbed(game, "bust", game.currencyEmoji)], components: [] });
      return;
    }
    if (pv === 21) {
      await resolveStand(interaction, game, true);
      return;
    }

    await interaction.update({ embeds: [bjEmbed(game, "playing", game.currencyEmoji)], components: [bjButtons(userId)] });
    return;
  }

  await resolveStand(interaction, game, false);
}

async function resolveStand(interaction: ButtonInteraction, game: BJGame, isAutoStand: boolean) {
  bjGames.delete(game.userId);

  while (handValue(game.dealerCards) < 17) {
    game.dealerCards.push(game.deck.pop()!);
  }

  const pv = handValue(game.playerCards);
  const dv = handValue(game.dealerCards);
  const isNaturalBJ = pv === 21 && game.playerCards.length === 2;

  let status: "win" | "lose" | "push";
  let delta: number;

  // Bet was deducted upfront at game start.
  // Win:  return original bet + winnings  (bet × 2, or bet + bet×1.5 for natural BJ)
  // Push: return original bet only
  // Lose: do nothing — already paid
  if (dv > 21 || pv > dv) {
    status = "win";
    delta  = isNaturalBJ ? game.bet + Math.floor(game.bet * 1.5) : game.bet * 2;
    await addBalance(game.guildId, game.userId, delta);
  } else if (pv === dv) {
    status = "push";
    delta  = 0;
    await addBalance(game.guildId, game.userId, game.bet); // refund
  } else {
    status = "lose";
    delta  = -game.bet;
    // No deduction — bet was already taken at game start
  }

  const fn = isAutoStand ? interaction.update : interaction.update;
  await fn.call(interaction, { embeds: [bjEmbed(game, status, game.currencyEmoji)], components: [] });
}

// ─── Main execute ─────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub    = interaction.options.getSubcommand();
  const betRaw = interaction.options.getString("bet", true).toLowerCase().trim();
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  // Resolve "all" / "max" to the user's current balance
  let bet: number;
  if (betRaw === "all" || betRaw === "max") {
    bet = eco.balance;
  } else {
    bet = Math.floor(Number(betRaw));
  }

  if (!Number.isFinite(bet) || bet < 1) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(THEME.danger)
          .setDescription(`❌ Invalid bet amount. Enter a number, \`all\`, or \`max\`.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (eco.balance < 1) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(THEME.danger)
          .setDescription(`❌ You're broke! Earn some ${em} with \`/daily\` or \`/work\`.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (eco.balance < bet) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(THEME.danger)
          .setDescription(`❌ You need **${bet.toLocaleString()} ${em}** to bet, but you only have **${eco.balance.toLocaleString()} ${em}**.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Coin Flip ────────────────────────────────────────────────────────────────
  if (sub === "coinflip") {
    const win = Math.random() < 0.5;
    let newBal: number;
    if (win) {
      newBal = await addBalance(interaction.guild.id, interaction.user.id, bet);
    } else {
      await deductBalance(interaction.guild.id, interaction.user.id, bet);
      newBal = eco.balance - bet;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(win ? THEME.success : THEME.danger)
          .setAuthor({ name: `🪙  Coin Flip  ·  ${BOT_NAME}` })
          .setDescription(win
            ? `The coin landed **Heads** — you win! **+${bet.toLocaleString()} ${em}**`
            : `The coin landed **Tails** — you lose! **-${bet.toLocaleString()} ${em}**`)
          .addFields({ name: "New Balance", value: `${newBal.toLocaleString()} ${em}`, inline: true })
          .setFooter({ text: `${BOT_NAME}  ·  Gambling` }),
      ],
    });
    return;
  }

  // ── Slots ────────────────────────────────────────────────────────────────────
  if (sub === "slots") {
    const reels    = [spinReel(), spinReel(), spinReel()];
    const { multiplier, label } = calcSlotPayout(reels, bet);
    let delta: number;
    let newBal: number;
    if (multiplier > 0) {
      delta  = Math.floor(bet * multiplier) - bet;
      newBal = await addBalance(interaction.guild.id, interaction.user.id, delta);
    } else {
      await deductBalance(interaction.guild.id, interaction.user.id, bet);
      newBal  = eco.balance - bet;
      delta   = -bet;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(multiplier > 1 ? THEME.success : multiplier > 0 ? THEME.warn : THEME.danger)
          .setAuthor({ name: `🎰  Slot Machine  ·  ${BOT_NAME}` })
          .setDescription(`## ${reels.join("  ")}`)
          .addFields(
            { name: "Result",      value: label,                                                     inline: false },
            { name: "Payout",      value: delta >= 0 ? `+${delta.toLocaleString()} ${em}` : `${delta.toLocaleString()} ${em}`, inline: true },
            { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`,                        inline: true },
          )
          .setFooter({ text: `Bet: ${bet.toLocaleString()} ${em}  ·  ${BOT_NAME} Gambling` }),
      ],
    });
    return;
  }

  // ── Roulette ─────────────────────────────────────────────────────────────────
  if (sub === "roulette") {
    const choice = interaction.options.getString("color", true) as "red" | "black" | "green";
    const roll   = Math.floor(Math.random() * 37);
    const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const resultColor = roll === 0 ? "green" : RED_NUMS.has(roll) ? "red" : "black";
    const colorEmoji  = { red: "🔴", black: "⚫", green: "🟢" }[resultColor];
    const multipliers = { red: 2, black: 2, green: 14 };
    const win         = choice === resultColor;
    let newBal: number;
    let delta: number;
    if (win) {
      delta  = bet * (multipliers[choice] - 1);
      newBal = await addBalance(interaction.guild.id, interaction.user.id, delta);
    } else {
      await deductBalance(interaction.guild.id, interaction.user.id, bet);
      newBal = eco.balance - bet;
      delta  = -bet;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(win ? THEME.success : THEME.danger)
          .setAuthor({ name: `🎡  Roulette  ·  ${BOT_NAME}` })
          .setDescription(`The wheel landed on **${colorEmoji} ${roll}** (${resultColor})`)
          .addFields(
            { name: "Your Bet",    value: `${colorEmoji} ${choice} (${multipliers[choice]}×)`,                                        inline: true },
            { name: "Result",      value: win ? `✅ Win!` : `❌ Lose`,                                                                 inline: true },
            { name: "Payout",      value: delta >= 0 ? `+${delta.toLocaleString()} ${em}` : `${delta.toLocaleString()} ${em}`,         inline: true },
            { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`,                                                         inline: true },
          )
          .setFooter({ text: `Bet: ${bet.toLocaleString()} ${em}  ·  ${BOT_NAME} Gambling` }),
      ],
    });
    return;
  }

  // ── Blackjack ────────────────────────────────────────────────────────────────
  if (sub === "blackjack") {
    if (bjGames.has(interaction.user.id)) {
      await interaction.reply({ content: "You already have a blackjack game running! Finish it first.", flags: MessageFlags.Ephemeral });
      return;
    }
    await deductBalance(interaction.guild.id, interaction.user.id, bet);

    const deck = newDeck();
    const game: BJGame = {
      guildId:      interaction.guild.id,
      userId:       interaction.user.id,
      bet,
      playerCards:  [deck.pop()!, deck.pop()!],
      dealerCards:  [deck.pop()!, deck.pop()!],
      deck,
      expiresAt:    Date.now() + 5 * 60 * 1000,
      currencyEmoji: em,
      currencyName:  config.currencyName,
    };
    bjGames.set(interaction.user.id, game);

    const pv = handValue(game.playerCards);
    if (pv === 21) {
      bjGames.delete(interaction.user.id);
      const winAmount = Math.floor(bet * 1.5);
      await addBalance(interaction.guild.id, interaction.user.id, bet + winAmount);
      await interaction.reply({ embeds: [bjEmbed(game, "win", em)], components: [] });
      return;
    }

    await interaction.reply({ embeds: [bjEmbed(game, "playing", em)], components: [bjButtons(interaction.user.id)] });
  }
}
