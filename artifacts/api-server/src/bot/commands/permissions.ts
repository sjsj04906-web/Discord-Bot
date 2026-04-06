import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getCommandRoles, addCommandRole, removeCommandRole, clearCommandRoles } from "../db.js";
import { THEME } from "../theme.js";

const COMMAND_NAMES = [
  "automod", "ban", "clear", "kick", "lock", "mute", "note",
  "permissions", "poll", "removewarn", "role", "serverinfo",
  "slowmode", "tempban", "unban", "unlock", "unmute",
  "userinfo", "warn", "warnings",
].sort();

export const data = new SlashCommandBuilder()
  .setName("permissions")
  .setDescription("Control which roles can use each command")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("view")
      .setDescription("See which roles are allowed to use a command")
      .addStringOption((o) => {
        const opt = o.setName("command").setDescription("Command to check").setRequired(true);
        for (const name of COMMAND_NAMES) opt.addChoices({ name: `/${name}`, value: name });
        return opt;
      })
  )
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Allow a role to use a command")
      .addStringOption((o) => {
        const opt = o.setName("command").setDescription("Command to restrict").setRequired(true);
        for (const name of COMMAND_NAMES) opt.addChoices({ name: `/${name}`, value: name });
        return opt;
      })
      .addRoleOption((o) => o.setName("role").setDescription("Role to allow").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a role from a command's allowed list")
      .addStringOption((o) => {
        const opt = o.setName("command").setDescription("Command to update").setRequired(true);
        for (const name of COMMAND_NAMES) opt.addChoices({ name: `/${name}`, value: name });
        return opt;
      })
      .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("clear")
      .setDescription("Remove all role restrictions from a command (anyone with default perms can use it)")
      .addStringOption((o) => {
        const opt = o.setName("command").setDescription("Command to clear").setRequired(true);
        for (const name of COMMAND_NAMES) opt.addChoices({ name: `/${name}`, value: name });
        return opt;
      })
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("Show all commands that have role restrictions configured")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "view") {
    const cmdName = interaction.options.getString("command", true);
    const roles = await getCommandRoles(interaction.guild.id, cmdName);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`🔑 // PERMISSIONS: /${cmdName}`)
      .setTimestamp();

    if (roles.length === 0) {
      embed.setDescription("No role restrictions — anyone with the default Discord permission can use this command.");
    } else {
      embed.setDescription(roles.map((r) => `<@&${r}>`).join("\n"));
      embed.setFooter({ text: `${roles.length} role(s) configured` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "add") {
    const cmdName = interaction.options.getString("command", true);
    const role = interaction.options.getRole("role", true);
    const ok = await addCommandRole(interaction.guild.id, cmdName, role.id, interaction.user.tag);

    if (!ok) {
      await interaction.reply({ content: `${role} can already use \`/${cmdName}\`.`, ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("✅ // PERMISSION ADDED")
          .addFields(
            { name: "COMMAND", value: `\`/${cmdName}\``, inline: true },
            { name: "ROLE",    value: `${role}`, inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "remove") {
    const cmdName = interaction.options.getString("command", true);
    const role = interaction.options.getRole("role", true);
    const ok = await removeCommandRole(interaction.guild.id, cmdName, role.id);

    if (!ok) {
      await interaction.reply({ content: `${role} wasn't in the allowed list for \`/${cmdName}\`.`, ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setTitle("🗑️ // PERMISSION REMOVED")
          .addFields(
            { name: "COMMAND", value: `\`/${cmdName}\``, inline: true },
            { name: "ROLE",    value: `${role}`, inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "clear") {
    const cmdName = interaction.options.getString("command", true);
    await clearCommandRoles(interaction.guild.id, cmdName);
    await interaction.reply({
      content: `✅ All role restrictions cleared for \`/${cmdName}\`. Default Discord permissions apply again.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "list") {
    const all = await getAllCommandPerms(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🔑 // COMMAND PERMISSIONS")
      .setTimestamp();

    if (all.size === 0) {
      embed.setDescription("No custom role restrictions configured. All commands use their default Discord permissions.");
    } else {
      for (const [cmd, roles] of all.entries()) {
        embed.addFields({
          name: `/${cmd}`,
          value: roles.map((r) => `<@&${r}>`).join(", "),
        });
      }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
}

async function getAllCommandPerms(guildId: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const name of COMMAND_NAMES) {
    const roles = await getCommandRoles(guildId, name);
    if (roles.length > 0) map.set(name, roles);
  }
  return map;
}
