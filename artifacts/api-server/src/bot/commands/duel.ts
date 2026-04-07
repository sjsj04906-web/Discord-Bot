import {
  SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  MessageFlags, type ChatInputCommandInteraction, type ButtonInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, deductBalance } from "../db.js";

const DUEL_TIMEOUT_MS = 60_000;

interface PendingDuel {
  guildId:      string;
  challengerId: string;
  targetId:     string;
  amount:       number;
  em:           string;
  channelId:    string;
  messageId:    string;
  timeoutRef:   ReturnType<typeof setTimeout>;
}

export const pendingDuels = new Map<string, PendingDuel>();

function duelKey(guildId: string, challengerId: string) {
  return `${guildId}:${challengerId}`;
}

const WIN_LINES = [
  "The coin fell. The credits followed.",
  "Fortune doesn't lie — it just picks a side.",
  "The grid saw it coming. You didn't.",
  "One flip. One victor. No rematch.",
];
const LOSE_LINES = [
  "The odds were even. The outcome wasn't.",
  "Probability giveth. Probability taketh.",
  "You came prepared. The coin didn't care.",
];

export const data = new SlashCommandBuilder()
  .setName("duel")
  .setDescription("Challenge another user to a high-stakes coinflip duel")
  .addUserOption((o) => o.setName("opponent").setDescription("Who to challenge").setRequired(true))
  .addStringOption((o) => o.setName("amount").setDescription('Stake amount (or "all")').setRequired(true).setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const opponent = interaction.options.getUser("opponent", true);
  const config   = await getGuildConfig(interaction.guild.id);
  const em       = config.currencyEmoji;

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> You cannot duel yourself.")], flags: MessageFlags.Ephemeral });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Bots don't accept challenges.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const key = duelKey(interaction.guild.id, interaction.user.id);
  if (pendingDuels.has(key)) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription("> You already have a pending challenge. Wait for it to resolve.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const raw    = interaction.options.getString("amount", true).toLowerCase().trim();
  const amount = raw === "all" || raw === "max" ? eco.balance : Math.floor(Number(raw));

  if (!Number.isFinite(amount) || amount < 1) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Invalid stake amount.")], flags: MessageFlags.Ephemeral });
    return;
  }
  if (eco.balance < amount) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> You only have **${eco.balance.toLocaleString()} ${em}** in your wallet.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  await deductBalance(interaction.guild.id, interaction.user.id, amount);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`duel_accept_${interaction.guild.id}_${interaction.user.id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️"),
    new ButtonBuilder()
      .setCustomId(`duel_decline_${interaction.guild.id}_${interaction.user.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setColor(0x9B00FF)
    .setAuthor({ name: `⚔️  Duel Declared  ·  ${BOT_NAME}` })
    .setDescription(
      `<@${interaction.user.id}> has thrown down the gauntlet before <@${opponent.id}>.\n\n` +
      `> *One coin. One flip. Winner takes all.*`
    )
    .addFields(
      { name: "◈ Challenger",   value: `<@${interaction.user.id}>`,         inline: true },
      { name: "◈ Opponent",     value: `<@${opponent.id}>`,                 inline: true },
      { name: "◈ Stake Each",   value: `${amount.toLocaleString()} ${em}`,  inline: true },
      { name: "◈ Winner Takes", value: `**${(amount * 2).toLocaleString()} ${em}**`, inline: true },
    )
    .setFooter({ text: `60 seconds to respond  ·  ${BOT_NAME} ◆ Duel` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], components: [row] });
  const msg = await interaction.fetchReply();

  const timeoutRef = setTimeout(async () => {
    pendingDuels.delete(key);
    await addBalance(interaction.guild!.id, interaction.user.id, amount);
    const expired = new EmbedBuilder()
      .setColor(THEME.muted)
      .setAuthor({ name: `⚔️  Duel Expired  ·  ${BOT_NAME}` })
      .setDescription(`> <@${opponent.id}> did not respond in time. Stake returned to <@${interaction.user.id}>.`);
    await interaction.editReply({ embeds: [expired], components: [] }).catch(() => {});
  }, DUEL_TIMEOUT_MS);

  pendingDuels.set(key, {
    guildId:      interaction.guild.id,
    challengerId: interaction.user.id,
    targetId:     opponent.id,
    amount,
    em,
    channelId:    interaction.channelId,
    messageId:    msg.id,
    timeoutRef,
  });
}

export async function handleDuelButton(
  interaction: ButtonInteraction,
  action: "accept" | "decline",
  guildId: string,
  challengerId: string,
) {
  const key  = duelKey(guildId, challengerId);
  const duel = pendingDuels.get(key);

  if (!duel) {
    await interaction.reply({ content: "This duel has already ended.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== duel.targetId) {
    await interaction.reply({ content: "This challenge was not directed at you.", flags: MessageFlags.Ephemeral });
    return;
  }

  clearTimeout(duel.timeoutRef);
  pendingDuels.delete(key);

  if (action === "decline") {
    await addBalance(guildId, duel.challengerId, duel.amount);
    const embed = new EmbedBuilder()
      .setColor(THEME.muted)
      .setAuthor({ name: `⚔️  Duel Declined  ·  ${BOT_NAME}` })
      .setDescription(`> <@${duel.targetId}> walked away. Stake returned to <@${duel.challengerId}>.`);
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  const targetEco = await getBalance(guildId, duel.targetId);
  if (targetEco.balance < duel.amount) {
    await addBalance(guildId, duel.challengerId, duel.amount);
    const embed = new EmbedBuilder()
      .setColor(THEME.danger)
      .setDescription(`> <@${duel.targetId}> cannot cover the stake. Duel voided — stake returned.`);
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  await deductBalance(guildId, duel.targetId, duel.amount);

  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? duel.challengerId : duel.targetId;
  const loserId  = challengerWins ? duel.targetId     : duel.challengerId;
  const prize    = duel.amount * 2;

  await addBalance(guildId, winnerId, prize);

  import("./quests.js").then((m) => {
    m.incrementQuestProgress(guildId, winnerId, "duel_win").catch(() => {});
    m.incrementQuestProgress(guildId, winnerId, "duel_play").catch(() => {});
    m.incrementQuestProgress(guildId, winnerId, "earn_coins", duel.amount).catch(() => {}); // net gain = stake, not full pot
    m.incrementQuestProgress(guildId, loserId, "duel_play").catch(() => {});
  }).catch(() => {});

  const winLine  = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)]!;
  const loseLine = LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)]!;

  const embed = new EmbedBuilder()
    .setColor(0xFFB703)
    .setAuthor({ name: `⚔️  Duel Resolved  ·  ${BOT_NAME}` })
    .setDescription(`> *"${winLine}"*\n\n🏆 **<@${winnerId}> wins the duel.**\n💸 <@${loserId}> — *"${loseLine}"*`)
    .addFields(
      { name: "◈ Winner",       value: `<@${winnerId}>`,                          inline: true },
      { name: "◈ Loser",        value: `<@${loserId}>`,                           inline: true },
      { name: "◈ Prize",        value: `**+${prize.toLocaleString()} ${duel.em}**`, inline: true },
    )
    .setFooter({ text: `${BOT_NAME}  ◆  Duel` })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
}
