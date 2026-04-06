import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getCommandRoles, addCommandRole, removeCommandRole, clearCommandRoles } from "../db.js";
import { THEME } from "../theme.js";

export const COMMAND_NAMES = new Set([
  "antiraid", "automod", "autorole", "ban", "bulkban", "case", "clear", "exportwarns",
  "history", "kick", "lock", "modmail", "mute", "note", "permissions", "poll",
  "reactionrole", "removewarn", "report", "role", "serverinfo", "slowmode",
  "stats", "tempban", "tempmute", "temprole", "ticket", "unban", "unlock",
  "unmute", "userinfo", "warn", "warnings", "welcome",
]);

export const data = new SlashCommandBuilder()
  .setName("permissions")
  .setDescription("Control which roles can use each command")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("view")
      .setDescription("See which roles are allowed to use a command")
      .addStringOption((o) =>
        o.setName("command").setDescription("Command name (e.g. ban, kick, warn)").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Allow a role to use a command")
      .addStringOption((o) =>
        o.setName("command").setDescription("Command name (e.g. ban, kick, warn)").setRequired(true)
      )
      .addRoleOption((o) => o.setName("role").setDescription("Role to allow").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a role from a command's allowed list")
      .addStringOption((o) =>
        o.setName("command").setDescription("Command name (e.g. ban, kick, warn)").setRequired(true)
      )
      .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("clear")
      .setDescription("Remove all role restrictions from a command")
      .addStringOption((o) =>
        o.setName("command").setDescription("Command name (e.g. ban, kick, warn)").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("Show all commands that have role restrictions configured")
  );

function validateCommand(name: string): string | null {
  const lower = name.toLowerCase().replace(/^\//, "");
  return COMMAND_NAMES.has(lower) ? lower : null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "view") {
    const raw = interaction.options.getString("command", true);
    const cmdName = validateCommand(raw);
    if (!cmdName) {
      await interaction.reply({ content: `Unknown command \`${raw}\`. Use \`/permissions list\` to see all commands.`, ephemeral: true });
      return;
    }

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
    const raw = interaction.options.getString("command", true);
    const cmdName = validateCommand(raw);
    if (!cmdName) {
      await interaction.reply({ content: `Unknown command \`${raw}\`.`, ephemeral: true });
      return;
    }

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
    const raw = interaction.options.getString("command", true);
    const cmdName = validateCommand(raw);
    if (!cmdName) {
      await interaction.reply({ content: `Unknown command \`${raw}\`.`, ephemeral: true });
      return;
    }

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
    const raw = interaction.options.getString("command", true);
    const cmdName = validateCommand(raw);
    if (!cmdName) {
      await interaction.reply({ content: `Unknown command \`${raw}\`.`, ephemeral: true });
      return;
    }

    await clearCommandRoles(interaction.guild.id, cmdName);
    await interaction.reply({
      content: `✅ All role restrictions cleared for \`/${cmdName}\`. Default Discord permissions apply again.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "list") {
    const map = new Map<string, string[]>();
    for (const name of COMMAND_NAMES) {
      const roles = await getCommandRoles(interaction.guild.id, name);
      if (roles.length > 0) map.set(name, roles);
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("🔑 // COMMAND PERMISSIONS")
      .setTimestamp();

    if (map.size === 0) {
      embed.setDescription("No custom role restrictions configured. All commands use their default Discord permissions.");
    } else {
      for (const [cmd, roles] of map.entries()) {
        embed.addFields({
          name: `/${cmd}`,
          value: roles.map((r) => `<@&${r}>`).join(", "),
        });
      }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
