import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, depositToBank, withdrawFromBank } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("bank")
  .setDescription("Manage your bank account — coins here are safe from robbers")
  .addSubcommand((s) =>
    s.setName("balance")
      .setDescription("View your wallet and bank balance")
  )
  .addSubcommand((s) =>
    s.setName("deposit")
      .setDescription("Move coins from your wallet into the bank")
      .addStringOption((o) =>
        o.setName("amount").setDescription('Amount to deposit (or "all")').setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s.setName("withdraw")
      .setDescription("Move coins from the bank back to your wallet")
      .addStringOption((o) =>
        o.setName("amount").setDescription('Amount to withdraw (or "all")').setRequired(true)
      )
  );

function resolveAmount(raw: string, available: number): number | null {
  if (raw.toLowerCase() === "all" || raw.toLowerCase() === "max") return available;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub    = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);
  const eco    = await getBalance(interaction.guild.id, interaction.user.id);
  const em     = config.currencyEmoji;

  if (sub === "balance") {
    const total = eco.balance + eco.bankBalance;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00BFFF)
          .setAuthor({ name: `🏦  Bank  ·  ${BOT_NAME}` })
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: "👜 Wallet",    value: `**${eco.balance.toLocaleString()}** ${em}`,     inline: true },
            { name: "🏦 Bank",      value: `**${eco.bankBalance.toLocaleString()}** ${em}`, inline: true },
            { name: "💰 Net Worth", value: `${total.toLocaleString()} ${em}`,               inline: true },
          )
          .setFooter({ text: `Bank balance is safe from robbers  ·  ${BOT_NAME}` })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "deposit") {
    const raw    = interaction.options.getString("amount", true);
    const amount = resolveAmount(raw, eco.balance);
    if (!amount) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Invalid amount.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (eco.balance < amount) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ You only have **${eco.balance.toLocaleString()} ${em}** in your wallet.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const result = await depositToBank(interaction.guild.id, interaction.user.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00BFFF)
          .setAuthor({ name: `🏦  Deposit  ·  ${BOT_NAME}` })
          .setDescription(`Secured **${amount.toLocaleString()} ${em}** in the vault.`)
          .addFields(
            { name: "👜 Wallet", value: `${result.wallet.toLocaleString()} ${em}`, inline: true },
            { name: "🏦 Bank",   value: `${result.bank.toLocaleString()} ${em}`,   inline: true },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "withdraw") {
    const raw    = interaction.options.getString("amount", true);
    const amount = resolveAmount(raw, eco.bankBalance);
    if (!amount) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Invalid amount.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (eco.bankBalance < amount) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ You only have **${eco.bankBalance.toLocaleString()} ${em}** in the bank.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const result = await withdrawFromBank(interaction.guild.id, interaction.user.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00BFFF)
          .setAuthor({ name: `🏦  Withdraw  ·  ${BOT_NAME}` })
          .setDescription(`Pulled **${amount.toLocaleString()} ${em}** from the vault.`)
          .addFields(
            { name: "👜 Wallet", value: `${result.wallet.toLocaleString()} ${em}`, inline: true },
            { name: "🏦 Bank",   value: `${result.bank.toLocaleString()} ${em}`,   inline: true },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
