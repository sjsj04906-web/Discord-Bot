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
  .setName("messagelog")
  .setDescription("Configure message edit and delete logging")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Set the channel where deleted and edited messages are logged")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Log channel").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("enable").setDescription("Enable message logging")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable message logging")
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show current message log configuration")
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
      messageLogChannelId: channel.id,
      messageLogEnabled: true,
    });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `📋  Message Logs  ·  ${BOT_NAME}` })
          .setDescription(`Message logs will be posted to ${channel}.\n\nDeleted messages, edited messages, and bulk deletes will all be recorded there.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "enable") {
    await updateGuildConfig(interaction.guild.id, { messageLogEnabled: true });
    await interaction.reply({ content: "✅ Message logging enabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { messageLogEnabled: false });
    await interaction.reply({ content: "🔇 Message logging disabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch      = config.messageLogChannelId ? `<#${config.messageLogChannelId}>` : "_Not set — using auto-detect_";
    const enabled = config.messageLogEnabled ? "✅ Enabled" : "🔇 Disabled";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle("📋 Message Log Status")
          .addFields(
            { name: "Status",  value: enabled, inline: true },
            { name: "Channel", value: ch,       inline: true },
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
