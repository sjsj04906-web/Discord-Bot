import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

export const data = new SlashCommandBuilder()
  .setName("antiraid")
  .setDescription("Manage anti-raid lockdown state")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("recover")
      .setDescription("Lift the raid lockdown — restore verification to normal and remove slowmode")
      .addStringOption((o) =>
        o.setName("level")
          .setDescription("Verification level to restore to (default: Low)")
          .setRequired(false)
          .addChoices(
            { name: "None",   value: "0" },
            { name: "Low",    value: "1" },
            { name: "Medium", value: "2" },
            { name: "High",   value: "3" },
          )
      )
  )
  .addSubcommand((sub) =>
    sub.setName("lockdown")
      .setDescription("Manually trigger a lockdown — raises verification to highest")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "recover") {
    const levelStr = interaction.options.getString("level") ?? "1";
    const level = parseInt(levelStr, 10) as 0 | 1 | 2 | 3;

    await interaction.deferReply({ ephemeral: true });

    let channelsCleared = 0;
    const textChannels = interaction.guild.channels.cache.filter((c) => c.isTextBased() && "rateLimitPerUser" in c) as Map<string, TextChannel>;
    for (const ch of textChannels.values()) {
      try {
        if (ch.rateLimitPerUser > 0) {
          await ch.setRateLimitPerUser(0, "Anti-raid recovery");
          channelsCleared++;
        }
      } catch { /* no perms */ }
    }

    try {
      await interaction.guild.setVerificationLevel(level, `Anti-raid recovery by ${interaction.user.tag}`);
    } catch {
      await interaction.editReply({ content: "⚠️ Could not change verification level — missing permissions." });
      return;
    }

    const levelLabels = ["None", "Low", "Medium", "High", "Highest"];
    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // RAID LOCKDOWN LIFTED")
      .addFields(
        { name: "VERIFICATION",    value: levelLabels[level] ?? "Low", inline: true },
        { name: "SLOWMODE LIFTED", value: `${channelsCleared} channel(s)`, inline: true },
        { name: "OPERATOR",        value: `${interaction.user}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const modChannel = interaction.guild.channels.cache.find(
      (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
    ) as TextChannel | undefined;
    if (modChannel) {
      await modChannel.send({ embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("✅ // RAID LOCKDOWN LIFTED")
          .setDescription(`Verification restored to **${levelLabels[level]}** by ${interaction.user}.`)
          .setTimestamp(),
      ]}).catch(() => {});
    }
    return;
  }

  if (sub === "lockdown") {
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.guild.setVerificationLevel(4, `Manual lockdown by ${interaction.user.tag}`);
    } catch {
      await interaction.editReply({ content: "⚠️ Could not raise verification level — missing permissions." });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.danger)
      .setTitle("🚨 // MANUAL LOCKDOWN ACTIVATED")
      .addFields(
        { name: "VERIFICATION", value: "HIGHEST", inline: true },
        { name: "OPERATOR",     value: `${interaction.user}`, inline: true },
      )
      .setFooter({ text: `Use /antiraid recover to lift the lockdown` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const modChannel = interaction.guild.channels.cache.find(
      (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
    ) as TextChannel | undefined;
    if (modChannel) {
      await modChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}
