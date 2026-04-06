import {
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, MessageFlags,
  type ChatInputCommandInteraction, type ButtonInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, deductBalance, incrementHeistCount } from "../db.js";
import { checkAndAward } from "../lib/achievements.js";

const JOIN_WINDOW_MS = 30_000;
const MIN_BET        = 50;

interface HeistGame {
  guildId:      string;
  channelId:    string;
  messageId:    string;
  bet:          number;
  participants: Map<string, string>; // userId → tag
  em:           string;
  endsAt:       number;
  resolved:     boolean;
}

export const heistGames = new Map<string, HeistGame>();

function successChance(players: number): number {
  return Math.min(0.35 + players * 0.10, 0.80);
}

export const data = new SlashCommandBuilder()
  .setName("heist")
  .setDescription("Start a crew heist — others can join and share the risk & reward")
  .addStringOption((o) =>
    o.setName("bet").setDescription(`Bet per player (min ${MIN_BET}, or "all")`).setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config   = await getGuildConfig(interaction.guild.id);
  const em       = config.currencyEmoji;
  const betRaw   = interaction.options.getString("bet", true).toLowerCase().trim();
  const eco      = await getBalance(interaction.guild.id, interaction.user.id);

  let bet: number;
  if (betRaw === "all" || betRaw === "max") {
    bet = eco.balance;
  } else {
    bet = Math.floor(Number(betRaw));
  }

  if (!Number.isFinite(bet) || bet < MIN_BET) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ Minimum heist bet is **${MIN_BET} ${em}**.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (heistGames.has(interaction.guild.id)) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription("⚠️ A heist is already in progress — join that one!")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (eco.balance < bet) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ You need **${bet.toLocaleString()} ${em}** to start this heist.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await deductBalance(interaction.guild.id, interaction.user.id, bet);

  const endsAt  = Date.now() + JOIN_WINDOW_MS;
  const game: HeistGame = {
    guildId:      interaction.guild.id,
    channelId:    interaction.channelId,
    messageId:    "",
    bet,
    participants: new Map([[interaction.user.id, interaction.user.tag]]),
    em,
    endsAt,
    resolved:     false,
  };
  heistGames.set(interaction.guild.id, game);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`heist_join_${interaction.guild.id}`)
      .setLabel(`Join Heist (${bet.toLocaleString()} ${em})`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🦹"),
  );

  const embed = buildLobbyEmbed(game, endsAt);
  await interaction.reply({ embeds: [embed], components: [row] });
  const msg = await interaction.fetchReply();
  game.messageId = msg.id;

  setTimeout(() => resolveHeist(interaction, game), JOIN_WINDOW_MS);
}

function buildLobbyEmbed(game: HeistGame, endsAt: number): EmbedBuilder {
  const names = [...game.participants.values()].map((t) => `• ${t}`).join("\n") || "None yet";
  return new EmbedBuilder()
    .setColor(0xFF4444)
    .setAuthor({ name: `🦹  Heist Forming  ·  ${BOT_NAME}` })
    .setDescription(`A crew is assembling for a high-stakes heist. Click to join!\n\nHeist executes <t:${Math.floor(endsAt / 1000)}:R>`)
    .addFields(
      { name: `Crew (${game.participants.size})`, value: names,                                       inline: true },
      { name: "Bet Per Player",                   value: `${game.bet.toLocaleString()} ${game.em}`, inline: true },
      { name: "Success Chance",                   value: `${Math.round(successChance(game.participants.size) * 100)}%`, inline: true },
    )
    .setFooter({ text: `Join now — the more crew, the better the odds` });
}

export async function handleHeistJoin(interaction: ButtonInteraction, guildId: string) {
  const game = heistGames.get(guildId);
  if (!game || game.resolved || Date.now() > game.endsAt) {
    await interaction.reply({ content: "This heist has already launched.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (game.participants.has(interaction.user.id)) {
    await interaction.reply({ content: "You're already in the crew.", flags: MessageFlags.Ephemeral });
    return;
  }

  const eco = await getBalance(guildId, interaction.user.id);
  if (eco.balance < game.bet) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ You need **${game.bet.toLocaleString()} ${game.em}** to join this heist.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await deductBalance(guildId, interaction.user.id, game.bet);
  game.participants.set(interaction.user.id, interaction.user.tag);
  await incrementHeistCount(guildId, interaction.user.id);
  checkAndAward(guildId, interaction.user.id, interaction.channel as never, game.em).catch(() => {});

  const embed = buildLobbyEmbed(game, game.endsAt);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`heist_join_${guildId}`)
      .setLabel(`Join Heist (${game.bet.toLocaleString()} ${game.em})`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🦹"),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function resolveHeist(interaction: ChatInputCommandInteraction, game: HeistGame) {
  if (game.resolved) return;
  game.resolved = true;
  heistGames.delete(game.guildId);

  const players     = [...game.participants.keys()];
  const chance      = successChance(players.length);
  const success     = Math.random() < chance;
  const totalPot    = game.bet * players.length;
  const payout      = Math.floor((totalPot * 2) / players.length);

  if (success) {
    await Promise.all(players.map((uid) => addBalance(game.guildId, uid, payout)));
    players.forEach((uid) => {
      import("./quests.js").then((m) => m.incrementQuestProgress(game.guildId, uid, "heist")).catch(() => {});
      import("./quests.js").then((m) => m.incrementQuestProgress(game.guildId, uid, "earn_coins", payout)).catch(() => {});
    });
    const names = [...game.participants.values()].map((t) => `• ${t}`).join("\n");
    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🏆  Heist Successful  ·  ${BOT_NAME}` })
      .setDescription(`The crew cracked the vault and walked away clean.`)
      .addFields(
        { name: "Crew",         value: names,                                  inline: true },
        { name: "Each Earned",  value: `+${payout.toLocaleString()} ${game.em}`, inline: true },
        { name: "Total Pot",    value: `${totalPot.toLocaleString()} ${game.em}`, inline: true },
      )
      .setTimestamp();

    try {
      const ch = interaction.guild?.channels.cache.get(game.channelId);
      if (ch?.isTextBased()) {
        const msg = await (ch as import("discord.js").TextChannel).messages.fetch(game.messageId).catch(() => null);
        await msg?.edit({ embeds: [embed], components: [] });
      }
    } catch {}
  } else {
    // Still count the attempt toward the heist quest
    players.forEach((uid) => {
      import("./quests.js").then((m) => m.incrementQuestProgress(game.guildId, uid, "heist")).catch(() => {});
    });
    const names = [...game.participants.values()].map((t) => `• ${t}`).join("\n");
    const embed = new EmbedBuilder()
      .setColor(THEME.danger)
      .setAuthor({ name: `🚨  Heist Failed  ·  ${BOT_NAME}` })
      .setDescription(`Corporate security shut it down. Everyone lost their stake.`)
      .addFields(
        { name: "Crew",       value: names,                                  inline: true },
        { name: "Each Lost",  value: `-${game.bet.toLocaleString()} ${game.em}`, inline: true },
        { name: "Total Lost", value: `${totalPot.toLocaleString()} ${game.em}`,  inline: true },
      )
      .setTimestamp();

    try {
      const ch = interaction.guild?.channels.cache.get(game.channelId);
      if (ch?.isTextBased()) {
        const msg = await (ch as import("discord.js").TextChannel).messages.fetch(game.messageId).catch(() => null);
        await msg?.edit({ embeds: [embed], components: [] });
      }
    } catch {}
  }
}
