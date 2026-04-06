import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getGuildConfig, updateGuildConfig, getWordFilter, addBannedWord, removeBannedWord, clearWordFilter } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("View or configure auto-mod settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand((sub) =>
    sub.setName("status").setDescription("View current auto-mod configuration")
  )

  .addSubcommand((sub) =>
    sub.setName("set")
      .setDescription("Change a numeric auto-mod threshold")
      .addStringOption((o) =>
        o.setName("setting")
          .setDescription("Which setting to change")
          .setRequired(true)
          .addChoices(
            { name: "Spam threshold (messages per 5s)",    value: "spamThreshold" },
            { name: "Caps threshold % (0–100)",             value: "capsThreshold" },
            { name: "Max mentions per message",             value: "maxMentions" },
            { name: "Max emojis per message (0 = off)",    value: "maxEmojis" },
            { name: "Max newlines per message (0 = off)",  value: "maxNewlines" },
            { name: "New account alert age (days, 0=off)", value: "newAccountDays" },
            { name: "Anti-raid join threshold",             value: "antiRaidThreshold" },
            { name: "Anti-raid window (seconds)",           value: "antiRaidWindowSecs" },
          )
      )
      .addIntegerOption((o) =>
        o.setName("value").setDescription("New value").setRequired(true).setMinValue(0).setMaxValue(1000)
      )
  )

  .addSubcommand((sub) =>
    sub.setName("toggle")
      .setDescription("Enable or disable an auto-mod feature")
      .addStringOption((o) =>
        o.setName("feature")
          .setDescription("Feature to toggle")
          .setRequired(true)
          .addChoices(
            { name: "Auto-escalation (warn → mute → ban)", value: "autoEscalation" },
            { name: "Message log (deleted/edited messages)", value: "messageLogEnabled" },
            { name: "Anti-raid protection",                  value: "antiRaidEnabled" },
            { name: "Link filter (block all URLs)",          value: "linkFilterEnabled" },
          )
      )
  )

  .addSubcommand((sub) =>
    sub.setName("exempt")
      .setDescription("Toggle auto-mod exemption for the current channel")
  )

  .addSubcommand((sub) =>
    sub.setName("warnexpiry")
      .setDescription("Set how many days before old warnings are automatically removed (0 = never)")
      .addIntegerOption((o) =>
        o.setName("days").setDescription("Days until warnings expire (0 = never)").setRequired(true).setMinValue(0).setMaxValue(365)
      )
  )

  .addSubcommandGroup((group) =>
    group.setName("words")
      .setDescription("Manage the custom banned word list")
      .addSubcommand((sub) =>
        sub.setName("add")
          .setDescription("Add a word to the ban list")
          .addStringOption((o) => o.setName("word").setDescription("Word to ban").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("remove")
          .setDescription("Remove a word from the ban list")
          .addStringOption((o) => o.setName("word").setDescription("Word to unban").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("View all banned words")
      )
      .addSubcommand((sub) =>
        sub.setName("clear").setDescription("Clear the entire banned word list")
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub   = interaction.options.getSubcommand();

  // ── Word filter subcommands ─────────────────────────────────────────────────
  if (group === "words") {
    if (sub === "add") {
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      const ok = await addBannedWord(interaction.guild.id, word, interaction.user.tag);
      if (!ok) {
        await interaction.reply({ content: `\`${word}\` is already on the ban list.`, ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.success).setTitle("✅ // WORD BANNED").addFields({ name: "WORD", value: `\`${word}\`` }).setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    if (sub === "remove") {
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      const ok = await removeBannedWord(interaction.guild.id, word);
      if (!ok) {
        await interaction.reply({ content: `\`${word}\` wasn't on the ban list.`, ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.warn).setTitle("🗑️ // WORD REMOVED").addFields({ name: "WORD", value: `\`${word}\`` }).setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const words = await getWordFilter(interaction.guild.id);
      const embed = new EmbedBuilder().setColor(THEME.info).setTitle("📋 // BANNED WORDS").setTimestamp();
      if (words.length === 0) {
        embed.setDescription("No banned words configured.");
      } else {
        embed.setDescription(words.map((w) => `\`${w}\``).join("  "));
        embed.setFooter({ text: `${words.length} word(s)` });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === "clear") {
      await clearWordFilter(interaction.guild.id);
      await interaction.reply({ content: "✅ Banned word list cleared.", ephemeral: true });
      return;
    }
  }

  const config = await getGuildConfig(interaction.guild.id);

  // ── Warn expiry ─────────────────────────────────────────────────────────────
  if (sub === "warnexpiry") {
    const days = interaction.options.getInteger("days", true);
    await updateGuildConfig(interaction.guild.id, { warnExpiryDays: days });
    const msg = days === 0
      ? "✅ Warning expiry disabled — warnings will never be automatically removed."
      : `✅ Warnings older than **${days} day${days === 1 ? "" : "s"}** will be automatically removed (checked every 6 hours).`;
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  if (sub === "status") {
    const exemptIds  = config.exemptChannels ? config.exemptChannels.split(",").filter(Boolean) : [];
    const exemptList = exemptIds.length > 0 ? exemptIds.map((id) => `<#${id}>`).join(", ") : "None";
    const wordCount  = (await getWordFilter(interaction.guild.id)).length;

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🛡️ // AUTO-MOD CONFIG")
      .addFields(
        { name: "SPAM THRESHOLD",   value: `${config.spamThreshold} msg/5s`, inline: true },
        { name: "CAPS THRESHOLD",   value: `${config.capsThreshold}%`, inline: true },
        { name: "MAX MENTIONS",     value: String(config.maxMentions), inline: true },
        { name: "MAX EMOJIS",       value: config.maxEmojis > 0 ? String(config.maxEmojis) : "Off", inline: true },
        { name: "MAX NEWLINES",     value: config.maxNewlines > 0 ? String(config.maxNewlines) : "Off", inline: true },
        { name: "NEW ACCT ALERT",   value: config.newAccountDays > 0 ? `${config.newAccountDays} days` : "Off", inline: true },
        { name: "ANTI-RAID",        value: config.antiRaidEnabled ? `✅ ${config.antiRaidThreshold} joins/${config.antiRaidWindowSecs}s` : "❌ Off", inline: true },
        { name: "LINK FILTER",      value: config.linkFilterEnabled ? "✅ On" : "❌ Off", inline: true },
        { name: "AUTO-ESCALATION",  value: config.autoEscalation ? "✅ On" : "❌ Off", inline: true },
        { name: "MESSAGE LOG",      value: config.messageLogEnabled ? "✅ On" : "❌ Off", inline: true },
        { name: "BANNED WORDS",     value: `${wordCount} word(s)`, inline: true },
        { name: "EXEMPT CHANNELS",  value: exemptList },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── Set ─────────────────────────────────────────────────────────────────────
  if (sub === "set") {
    const setting = interaction.options.getString("setting", true) as
      "spamThreshold" | "capsThreshold" | "maxMentions" | "maxEmojis" |
      "maxNewlines" | "newAccountDays" | "antiRaidThreshold" | "antiRaidWindowSecs";
    const value = interaction.options.getInteger("value", true);

    await updateGuildConfig(interaction.guild.id, { [setting]: value });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("✅ // CONFIG UPDATED")
          .addFields({ name: setting, value: String(value) })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────
  if (sub === "toggle") {
    const feature = interaction.options.getString("feature", true) as
      "autoEscalation" | "messageLogEnabled" | "antiRaidEnabled" | "linkFilterEnabled";
    const current = config[feature];
    await updateGuildConfig(interaction.guild.id, { [feature]: !current });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(!current ? THEME.success : THEME.danger)
          .setTitle("🔄 // FEATURE TOGGLED")
          .addFields({ name: feature, value: !current ? "✅ Enabled" : "❌ Disabled" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  // ── Exempt ──────────────────────────────────────────────────────────────────
  if (sub === "exempt") {
    const channelId = interaction.channelId;
    const ids     = config.exemptChannels ? config.exemptChannels.split(",").filter(Boolean) : [];
    const already = ids.includes(channelId);

    if (already) {
      const updated = ids.filter((id) => id !== channelId).join(",");
      await updateGuildConfig(interaction.guild.id, { exemptChannels: updated });
      await interaction.reply({ content: `✅ <#${channelId}> removed from auto-mod exemptions.`, ephemeral: true });
    } else {
      ids.push(channelId);
      await updateGuildConfig(interaction.guild.id, { exemptChannels: ids.join(",") });
      await interaction.reply({ content: `✅ <#${channelId}> is now exempt from auto-mod.`, ephemeral: true });
    }
  }
}
