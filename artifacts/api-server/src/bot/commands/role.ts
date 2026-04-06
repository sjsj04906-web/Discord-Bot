import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("role")
  .setDescription("Add or remove a role from a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Add a role to a member")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a role from a member")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser("user", true);
  const role = interaction.options.getRole("role", true);

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "Entity not found in this network.", ephemeral: true });
    return;
  }

  const guildRole = interaction.guild.roles.cache.get(role.id);
  if (!guildRole) {
    await interaction.reply({ content: "Role not found.", ephemeral: true });
    return;
  }

  if (guildRole.position >= (interaction.guild.members.me?.roles.highest.position ?? 0)) {
    await interaction.reply({ content: "That role is above my highest role — I cannot assign it.", ephemeral: true });
    return;
  }

  try {
    if (sub === "add") {
      await member.roles.add(guildRole, `Added by ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(THEME.success)
        .setTitle("✅ // ROLE ASSIGNED")
        .addFields(
          { name: "TARGET",   value: `${target} \`${target.tag}\``, inline: true },
          { name: "ROLE",     value: `${guildRole}`, inline: true },
          { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else {
      await member.roles.remove(guildRole, `Removed by ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(THEME.warn)
        .setTitle("🔻 // ROLE REVOKED")
        .addFields(
          { name: "TARGET",   value: `${target} \`${target.tag}\``, inline: true },
          { name: "ROLE",     value: `${guildRole}`, inline: true },
          { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    await interaction.reply({ content: `Failed: ${String(err)}`, ephemeral: true });
  }
}
