import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { addTempRole, getPendingTempRoles } from "../db.js";
import { processTempRole } from "../temproleScheduler.js";
import { THEME } from "../theme.js";
import { parseDuration, formatDuration } from "../utils/duration.js";

export const data = new SlashCommandBuilder()
  .setName("temprole")
  .setDescription("Assign a role to a member for a limited time")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to assign the role to").setRequired(true)
  )
  .addRoleOption((o) =>
    o.setName("role").setDescription("Role to assign").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("duration").setDescription("Duration e.g. 1h 2d 30m").setRequired(true).setAutocomplete(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target      = interaction.options.getUser("user", true);
  const role        = interaction.options.getRole("role", true);
  const durationStr = interaction.options.getString("duration", true);

  const ms = parseDuration(durationStr);
  if (!ms || ms <= 0) {
    await interaction.reply({ content: "Invalid duration. Try `1h`, `2d`, `30m`.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "Member not found in this server.", ephemeral: true });
    return;
  }

  const botMember = interaction.guild.members.cache.get(interaction.client.user!.id);
  if (botMember && role.position >= (botMember.roles.highest.position ?? 0)) {
    await interaction.reply({ content: "I cannot assign a role higher than my own highest role.", ephemeral: true });
    return;
  }

  await member.roles.add(role.id, `Temp role for ${formatDuration(ms)} by ${interaction.user.tag}`);

  const expiresAt = new Date(Date.now() + ms);
  const record = await addTempRole(interaction.guild.id, target.id, target.tag, role.id, role.name, expiresAt);

  processTempRole(
    interaction.client, record.id, interaction.guild.id,
    target.id, target.tag, role.id, role.name, expiresAt
  ).catch(() => {});

  const label = formatDuration(ms);

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setTitle("🎭 // TEMP ROLE ASSIGNED")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "USER",     value: `${target} \`${target.tag}\``, inline: true },
      { name: "ROLE",     value: `${role}`, inline: true },
      { name: "DURATION", value: label, inline: true },
      { name: "EXPIRES",  value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
    )
    .setFooter({ text: `ID: ${target.id}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
