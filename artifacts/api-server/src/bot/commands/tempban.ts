import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { addTempBan } from "../db.js";
import { processTempBan } from "../tempbanScheduler.js";
import { THEME } from "../theme.js";
import { client } from "../client.js";

const DURATIONS = [
  { name: "1 hour",   value: 3600 },
  { name: "6 hours",  value: 21600 },
  { name: "12 hours", value: 43200 },
  { name: "1 day",    value: 86400 },
  { name: "3 days",   value: 259200 },
  { name: "1 week",   value: 604800 },
];

export const data = new SlashCommandBuilder()
  .setName("tempban")
  .setDescription("Temporarily ban a member — auto-unbans after the duration")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to temp-ban").setRequired(true)
  )
  .addIntegerOption((o) => {
    const opt = o.setName("duration").setDescription("Ban duration").setRequired(true);
    for (const d of DURATIONS) opt.addChoices({ name: d.name, value: d.value });
    return opt;
  })
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the ban").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const durationSecs = interaction.options.getInteger("duration", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const durationLabel = DURATIONS.find((d) => d.value === durationSecs)?.name ?? `${durationSecs}s`;

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (member && !member.bannable) {
    await interaction.reply({ content: "Cannot ban this entity — insufficient clearance.", ephemeral: true });
    return;
  }

  const unbanAt = new Date(Date.now() + durationSecs * 1000);

  try {
    await interaction.guild.members.ban(target, {
      reason: `[TEMP ${durationLabel}] ${reason} | By ${interaction.user.tag}`,
    });

    const banId = await addTempBan(interaction.guild.id, target.id, target.tag, reason, unbanAt);
    processTempBan(client, banId, interaction.guild.id, target.id, target.tag, unbanAt).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(THEME.ban)
      .setTitle("⏳ // TEMP BAN ISSUED")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "TARGET",    value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR",  value: `${interaction.user}`, inline: true },
        { name: "DURATION",  value: durationLabel, inline: true },
        { name: "EXPIRES",   value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
        { name: "REASON",    value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.ban(target.tag, interaction.guild.name, `TEMP ${durationLabel} — ${reason}`);

    await sendModLog(interaction.guild, {
      action: "⏳ TEMP BAN",
      color: THEME.ban,
      target,
      moderator: interaction.user,
      reason,
      duration: durationLabel,
      extra: { EXPIRES: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>` },
    });
  } catch (err) {
    await interaction.reply({ content: `Execution failed: ${String(err)}`, ephemeral: true });
  }
}
