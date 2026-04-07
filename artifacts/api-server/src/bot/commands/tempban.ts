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
import { THEME, BOT_NAME } from "../theme.js";
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
    o.setName("reason").setDescription("Reason for the ban").setRequired(false).setAutocomplete(true)
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

  const member = interaction.guild.members.cache.get(target.id)
    ?? await interaction.guild.members.fetch(target.id).catch(() => null);

  if (member && !member.bannable) {
    await interaction.reply({ content: "I don't have permission to ban this member.", ephemeral: true });
    return;
  }

  // Strip all non-@everyone roles before banning
  const strippedRoles: string[] = [];
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== interaction.guild!.id);
    strippedRoles.push(...roles.map((r) => `<@&${r.id}>`));
    await member.roles.set([], `Pre-ban role strip — banned by ${interaction.user.tag}`).catch(() => {});
  }

  const unbanAt = new Date(Date.now() + durationSecs * 1000);

  try {
    await interaction.guild.members.ban(target, {
      reason: `[Temp ${durationLabel}] ${reason} — by ${interaction.user.tag}`,
    });

    const banId = await addTempBan(interaction.guild.id, target.id, target.tag, reason, unbanAt);
    processTempBan(client, banId, interaction.guild.id, target.id, target.tag, unbanAt).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(THEME.ban)
      .setAuthor({ name: `⏳  Temporary Ban  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Member",    value: `${target}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Duration",  value: durationLabel, inline: true },
        { name: "Expires",   value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
        { name: "Reason",    value: reason },
      );

    if (strippedRoles.length > 0) {
      embed.addFields({ name: "Roles Stripped", value: strippedRoles.join(" ") });
    }

    embed.setFooter({ text: `ID: ${target.id}` }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.ban(target.tag, interaction.guild.name, `Temp ${durationLabel} — ${reason}`);

    await sendModLog(interaction.guild, {
      action: "⏳  Temporary Ban",
      color: THEME.ban,
      target,
      moderator: interaction.user,
      reason,
      duration: durationLabel,
      extra: { "Expires": `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>` },
      adminOnly: true,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to ban member: ${String(err)}`, ephemeral: true });
  }
}
