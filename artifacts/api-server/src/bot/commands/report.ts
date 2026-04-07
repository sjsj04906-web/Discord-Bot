import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs", "audit-log", "auditlog"];

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Anonymously report a member to the moderation team")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to report").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("What did they do?").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName("evidence").setDescription("Message link or extra context (optional)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const evidence = interaction.options.getString("evidence");

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "You cannot report yourself.", ephemeral: true });
    return;
  }

  const modChannel = interaction.guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!modChannel) {
    await interaction.reply({
      content: "Report received, but no mod-log channel was found. Please contact a moderator directly.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setTitle("📩 // ANONYMOUS REPORT RECEIVED")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "REPORTED USER", value: `${target} \`${target.tag}\``, inline: true },
      { name: "USER ID",       value: `\`${target.id}\``, inline: true },
      { name: "CHANNEL",       value: `<#${interaction.channelId}>`, inline: true },
      { name: "REASON",        value: reason },
    )
    .setFooter({ text: `${BOT_NAME} • Reporter identity is not stored or logged` })
    .setTimestamp();

  if (evidence) {
    embed.addFields({ name: "EVIDENCE / CONTEXT", value: evidence });
  }

  await modChannel.send({ embeds: [embed] });

  await interaction.reply({
    content: "✅ Your report has been sent to the moderation team anonymously. Thank you.",
    ephemeral: true,
  });
}
