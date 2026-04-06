import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, deductBalance, updateLastRob, incrementRobSuccesses } from "../db.js";
import { checkAndAward } from "../lib/achievements.js";

const ROB_COOLDOWN_MS  = 30 * 60 * 1000;
const SUCCESS_CHANCE   = 0.45;
const STEAL_MIN_PCT    = 0.10;
const STEAL_MAX_PCT    = 0.30;
const FINE_PCT         = 0.20;
const MIN_STEAL_TARGET = 100;

const SUCCESS_LINES = [
  "You slipped through the firewall like smoke.",
  "Clean extraction. They never saw you coming.",
  "The heist went flawless. Credits transferred.",
  "You ghosted their security and drained the wallet.",
];
const FAIL_LINES = [
  "Their ICE caught you cold. Pay the fine.",
  "The mark was packing countermeasures. You got burned.",
  "You tripped a proximity sensor. Wallet hit incoming.",
  "Security drone spotted you. Time to pay up.",
];

export const data = new SlashCommandBuilder()
  .setName("rob")
  .setDescription("Attempt to steal coins from another user's wallet")
  .addUserOption((o) => o.setName("target").setDescription("Who to rob").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const target = interaction.options.getUser("target", true);
  const config = await getGuildConfig(interaction.guild.id);
  const em     = config.currencyEmoji;

  if (target.id === interaction.user.id) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ You can't rob yourself.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (target.bot) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Bots don't carry wallets.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const robberEco = await getBalance(interaction.guild.id, interaction.user.id);
  const now = Date.now();

  if (robberEco.lastRob && now - robberEco.lastRob.getTime() < ROB_COOLDOWN_MS) {
    const next = robberEco.lastRob.getTime() + ROB_COOLDOWN_MS;
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription(`⏳ Lie low. You can rob again <t:${Math.floor(next / 1000)}:R>.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetEco = await getBalance(interaction.guild.id, target.id);

  if (targetEco.balance < MIN_STEAL_TARGET) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.muted).setDescription(`🤷 ${target.username} is broke — not worth the risk.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (robberEco.balance < 50) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ You need at least **50 ${em}** in your wallet before attempting a heist.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await updateLastRob(interaction.guild.id, interaction.user.id);

  const success = Math.random() < SUCCESS_CHANCE;

  if (success) {
    const pct    = STEAL_MIN_PCT + Math.random() * (STEAL_MAX_PCT - STEAL_MIN_PCT);
    const stolen = Math.max(1, Math.floor(targetEco.balance * pct));
    await deductBalance(interaction.guild.id, target.id, stolen);
    const newBal = await addBalance(interaction.guild.id, interaction.user.id, stolen);
    const line   = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)]!;
    await incrementRobSuccesses(interaction.guild.id, interaction.user.id);
    checkAndAward(interaction.guild.id, interaction.user.id, interaction.channel as never, em).catch(() => {});

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🦹  Rob  ·  ${BOT_NAME}` })
          .setDescription(`**${line}**`)
          .addFields(
            { name: "Target",      value: `${target}`,                           inline: true },
            { name: "Stolen",      value: `+${stolen.toLocaleString()} ${em}`,   inline: true },
            { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`,    inline: true },
          )
          .setFooter({ text: `Next rob available in 30 minutes` })
          .setTimestamp(),
      ],
    });
  } else {
    const fine   = Math.max(1, Math.floor(robberEco.balance * FINE_PCT));
    await deductBalance(interaction.guild.id, interaction.user.id, fine);
    await addBalance(interaction.guild.id, target.id, fine);
    const newBal = robberEco.balance - fine;
    const line   = FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)]!;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setAuthor({ name: `🚨  Busted!  ·  ${BOT_NAME}` })
          .setDescription(`**${line}**`)
          .addFields(
            { name: "Target",      value: `${target}`,                        inline: true },
            { name: "Fine Paid",   value: `-${fine.toLocaleString()} ${em}`,  inline: true },
            { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`, inline: true },
          )
          .setFooter({ text: `Next rob available in 30 minutes` })
          .setTimestamp(),
      ],
    });
  }
}
