import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, updateGuildConfig, getBalance, addBalance, deductBalance, setEconomyBalance } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("economy")
  .setDescription("Manage the economy system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s.setName("setup")
      .setDescription("Configure economy settings")
      .addStringOption((o) => o.setName("currency_name").setDescription("Currency name (e.g. credits, bits)").setRequired(false))
      .addStringOption((o) => o.setName("currency_emoji").setDescription("Currency emoji").setRequired(false))
      .addIntegerOption((o) => o.setName("daily_amount").setDescription("Base daily reward amount").setRequired(false).setMinValue(1))
      .addIntegerOption((o) => o.setName("work_cooldown").setDescription("Work cooldown in minutes").setRequired(false).setMinValue(1))
  )
  .addSubcommand((s) =>
    s.setName("give")
      .setDescription("Give coins to a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s.setName("take")
      .setDescription("Take coins from a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Amount to take").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s.setName("set")
      .setDescription("Set a user's balance")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("New balance").setRequired(true).setMinValue(0))
  )
  .addSubcommand((s) =>
    s.setName("status")
      .setDescription("Show economy configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);
  const em = config.currencyEmoji;

  if (sub === "setup") {
    const updates: Record<string, unknown> = {};
    const name   = interaction.options.getString("currency_name");
    const emoji  = interaction.options.getString("currency_emoji");
    const daily  = interaction.options.getInteger("daily_amount");
    const cool   = interaction.options.getInteger("work_cooldown");
    if (name)  updates["currencyName"]     = name;
    if (emoji) updates["currencyEmoji"]    = emoji;
    if (daily) updates["dailyAmount"]      = daily;
    if (cool)  updates["workCooldownMins"] = cool;

    if (Object.keys(updates).length === 0) {
      await interaction.reply({ content: "No changes provided.", flags: MessageFlags.Ephemeral });
      return;
    }
    await updateGuildConfig(interaction.guild.id, updates);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `✅  Economy Updated  ·  ${BOT_NAME}` })
          .addFields(
            name  ? { name: "Currency Name",   value: name,   inline: true } : [],
            emoji ? { name: "Currency Emoji",  value: emoji,  inline: true } : [],
            daily ? { name: "Daily Amount",    value: String(daily), inline: true } : [],
            cool  ? { name: "Work Cooldown",   value: `${cool}m`,   inline: true } : [],
          ).flat(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setAuthor({ name: `${em}  Economy Config  ·  ${BOT_NAME}` })
          .addFields(
            { name: "Currency",      value: `${config.currencyEmoji} ${config.currencyName}`, inline: true },
            { name: "Daily Amount",  value: String(config.dailyAmount),                       inline: true },
            { name: "Work Cooldown", value: `${config.workCooldownMins} min`,                 inline: true },
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (sub === "give") {
    const newBal = await addBalance(interaction.guild.id, target.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription(`✅ Gave **${amount.toLocaleString()} ${em}** to ${target}. New balance: **${newBal.toLocaleString()} ${em}**`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "take") {
    const eco = await getBalance(interaction.guild.id, target.id);
    const take = Math.min(amount, eco.balance);
    await deductBalance(interaction.guild.id, target.id, take);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`✅ Took **${take.toLocaleString()} ${em}** from ${target}. New balance: **${(eco.balance - take).toLocaleString()} ${em}**`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "set") {
    await setEconomyBalance(interaction.guild.id, target.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setDescription(`✅ Set ${target}'s balance to **${amount.toLocaleString()} ${em}**`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
