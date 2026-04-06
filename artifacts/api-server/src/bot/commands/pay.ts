import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, transferBalance } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Send coins to another user")
  .addUserOption((o) => o.setName("user").setDescription("Who to pay").setRequired(true))
  .addIntegerOption((o) => o.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "You can't pay yourself.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: "You can't pay a bot.", flags: MessageFlags.Ephemeral });
    return;
  }

  const config = await getGuildConfig(interaction.guild.id);
  const em = config.currencyEmoji;
  const eco = await getBalance(interaction.guild.id, interaction.user.id);

  if (eco.balance < amount) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setDescription(`❌ Insufficient funds. You only have **${eco.balance.toLocaleString()} ${em}**.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await transferBalance(interaction.guild.id, interaction.user.id, target.id, amount);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: `${em}  Transfer Sent  ·  ${BOT_NAME}` })
        .setDescription(`You sent **${amount.toLocaleString()} ${em}** to ${target}.`)
        .addFields(
          { name: "Your Balance",    value: `${(eco.balance - amount).toLocaleString()} ${em}`, inline: true },
        )
        .setFooter({ text: `${BOT_NAME}  ·  Economy` })
        .setTimestamp(),
    ],
  });
}
