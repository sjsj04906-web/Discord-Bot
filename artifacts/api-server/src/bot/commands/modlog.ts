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
  .setName("modlog")
  .setDescription("Configure the mod action log channel (bans, kicks, warns, mutes…)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Set the channel where moderation actions are logged")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Log channel").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show current mod log channel")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Clear the configured mod log channel (fall back to auto-detect)")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    await updateGuildConfig(interaction.guild.id, { modLogChannelId: channel.id });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🔨  Mod Log  ·  ${BOT_NAME}` })
          .setDescription(
            `Moderation actions will now be logged to ${channel}.\n\n` +
            "**Logged events:**\n" +
            "• Bans / unbans / kicks\n" +
            "• Mutes / unmutes / tempbans\n" +
            "• Warns and case notes\n" +
            "• Softbans"
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { modLogChannelId: "" });
    await interaction.reply({
      content: "Mod log channel cleared — will fall back to auto-detecting a channel named `mod-log`, `modlog`, or `audit-log`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch = config.modLogChannelId ? `<#${config.modLogChannelId}>` : "_Auto-detect by channel name_";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle("🔨 Mod Log Status")
          .addFields({ name: "Channel", value: ch }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
