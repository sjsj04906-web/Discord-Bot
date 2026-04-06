import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../db.js";
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
      .setDescription("Change an auto-mod setting")
      .addStringOption((o) =>
        o.setName("setting")
          .setDescription("Which setting to change")
          .setRequired(true)
          .addChoices(
            { name: "Spam threshold (messages per 5s)",   value: "spamThreshold" },
            { name: "Caps threshold % (0-100)",            value: "capsThreshold" },
            { name: "Max mentions per message",            value: "maxMentions" },
            { name: "New account age alert (days, 0=off)", value: "newAccountDays" },
            { name: "Anti-raid join threshold",            value: "antiRaidThreshold" },
            { name: "Anti-raid window (seconds)",          value: "antiRaidWindowSecs" },
          )
      )
      .addIntegerOption((o) =>
        o.setName("value").setDescription("New value for the setting").setRequired(true).setMinValue(0).setMaxValue(100)
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
            { name: "Anti-raid protection",                 value: "antiRaidEnabled" },
          )
      )
  )
  .addSubcommand((sub) =>
    sub.setName("exempt")
      .setDescription("Toggle auto-mod exemption for the current channel")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);

  if (sub === "status") {
    const exemptIds = config.exemptChannels ? config.exemptChannels.split(",").filter(Boolean) : [];
    const exemptList = exemptIds.length > 0 ? exemptIds.map((id) => `<#${id}>`).join(", ") : "None";

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🛡️ // AUTO-MOD CONFIG")
      .addFields(
        { name: "SPAM THRESHOLD",    value: `${config.spamThreshold} msg/5s`, inline: true },
        { name: "CAPS THRESHOLD",    value: `${config.capsThreshold}%`, inline: true },
        { name: "MAX MENTIONS",      value: String(config.maxMentions), inline: true },
        { name: "NEW ACCT ALERT",    value: config.newAccountDays > 0 ? `${config.newAccountDays} days` : "Off", inline: true },
        { name: "ANTI-RAID",         value: config.antiRaidEnabled ? `✅ ${config.antiRaidThreshold} joins/${config.antiRaidWindowSecs}s` : "❌ Off", inline: true },
        { name: "AUTO-ESCALATION",   value: config.autoEscalation ? "✅ On" : "❌ Off", inline: true },
        { name: "MESSAGE LOG",       value: config.messageLogEnabled ? "✅ On" : "❌ Off", inline: true },
        { name: "EXEMPT CHANNELS",   value: exemptList },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "set") {
    const setting = interaction.options.getString("setting", true) as
      "spamThreshold" | "capsThreshold" | "maxMentions" | "newAccountDays" | "antiRaidThreshold" | "antiRaidWindowSecs";
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

  if (sub === "toggle") {
    const feature = interaction.options.getString("feature", true) as
      "autoEscalation" | "messageLogEnabled" | "antiRaidEnabled";
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

  if (sub === "exempt") {
    const channelId = interaction.channelId;
    const ids = config.exemptChannels ? config.exemptChannels.split(",").filter(Boolean) : [];
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
