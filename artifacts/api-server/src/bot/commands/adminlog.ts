import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("adminlog")
  .setDescription("Configure the admin/server-change log channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Set the channel for admin events (channel, role, member, server changes)")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Log channel").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("enable").setDescription("Enable admin logging")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable admin logging")
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show current admin log configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    await updateGuildConfig(interaction.guild.id, {
      adminLogChannelId: channel.id,
      adminLogEnabled: true,
    });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🛡️  Admin Logs  ·  ${BOT_NAME}` })
          .setDescription(
            `Admin events will now be posted to ${channel}.\n\n` +
            "**Logged events:**\n" +
            "• Channel created / deleted / edited\n" +
            "• Role created / deleted / edited\n" +
            "• Member role or nickname changes\n" +
            "• Server setting changes"
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "enable") {
    await updateGuildConfig(interaction.guild.id, { adminLogEnabled: true });
    await interaction.reply({ content: "✅ Admin logging enabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { adminLogEnabled: false });
    await interaction.reply({ content: "🔇 Admin logging disabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch      = config.adminLogChannelId ? `<#${config.adminLogChannelId}>` : "_Not set — using auto-detect_";
    const enabled = config.adminLogEnabled ? "✅ Enabled" : "🔇 Disabled";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle("🛡️ Admin Log Status")
          .addFields(
            { name: "Status",  value: enabled, inline: true },
            { name: "Channel", value: ch,       inline: true },
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
