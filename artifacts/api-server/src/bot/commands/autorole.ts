import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../db.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("autorole")
  .setDescription("Automatically assign roles when a new member joins")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Add a role to the auto-assign list")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to auto-assign on join").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a role from the auto-assign list")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to remove from auto-assign").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("Show all roles that are auto-assigned on join")
  )
  .addSubcommand((sub) =>
    sub.setName("clear")
      .setDescription("Remove all auto-role assignments")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub    = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);
  const ids    = config.autoRoleIds ? config.autoRoleIds.split(",").filter(Boolean) : [];

  if (sub === "add") {
    const role = interaction.options.getRole("role", true);

    const botMember = interaction.guild.members.cache.get(interaction.client.user!.id);
    if (botMember && role.position >= (botMember.roles.highest.position ?? 0)) {
      await interaction.reply({ content: "I cannot assign a role higher than my own highest role.", ephemeral: true });
      return;
    }

    if (ids.includes(role.id)) {
      await interaction.reply({ content: `${role} is already in the auto-role list.`, ephemeral: true });
      return;
    }

    ids.push(role.id);
    await updateGuildConfig(interaction.guild.id, { autoRoleIds: ids.join(",") });

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // AUTO-ROLE ADDED")
      .setDescription(`${role} will now be assigned to all new members when they join.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "remove") {
    const role = interaction.options.getRole("role", true);

    if (!ids.includes(role.id)) {
      await interaction.reply({ content: `${role} is not in the auto-role list.`, ephemeral: true });
      return;
    }

    const newIds = ids.filter((id) => id !== role.id);
    await updateGuildConfig(interaction.guild.id, { autoRoleIds: newIds.join(",") });

    await interaction.reply({
      content: `✅ Removed ${role} from the auto-role list.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "list") {
    if (ids.length === 0) {
      await interaction.reply({ content: "No auto-roles configured. Use `/autorole add` to add one.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🎭 // AUTO-ROLES")
      .setDescription(`${ids.length} role(s) will be assigned on join:`)
      .addFields({ name: "ROLES", value: ids.map((id) => `<@&${id}>`).join("\n") })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "clear") {
    await updateGuildConfig(interaction.guild.id, { autoRoleIds: "" });
    await interaction.reply({ content: "✅ All auto-roles cleared.", ephemeral: true });
  }
}
