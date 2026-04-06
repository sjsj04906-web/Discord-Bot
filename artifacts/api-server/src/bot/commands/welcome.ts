import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { setWelcomeConfig, getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { handleWelcome } from "../events/welcome.js";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Configure the welcome message sent to new members")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("channel")
      .setDescription("Set the channel where welcome messages are sent")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("The welcome channel").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("message")
      .setDescription("Set the welcome message text")
      .addStringOption((o) =>
        o.setName("text")
          .setDescription("Use {user} {username} {server} {membercount} {tag} as variables")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("test")
      .setDescription("Preview the welcome message as if you just joined")
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Disable welcome messages")
  )
  .addSubcommand((sub) =>
    sub.setName("status")
      .setDescription("Show the current welcome configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "channel") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await setWelcomeConfig(interaction.guild.id, { welcomeChannelId: ch.id });

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(THEME.success).setTitle("✅ // WELCOME CHANNEL SET")
          .setDescription(`Welcome messages will be sent to ${ch}.`)
          .setFooter({ text: "Set a message with /welcome message" })
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "message") {
    const text = interaction.options.getString("text", true);
    await setWelcomeConfig(interaction.guild.id, { welcomeMessage: text });

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(THEME.success).setTitle("✅ // WELCOME MESSAGE SET")
          .addFields({ name: "MESSAGE", value: text })
          .setFooter({ text: "Variables: {user} {username} {server} {membercount} {tag}" })
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "test") {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member) {
      await interaction.reply({ content: "Could not fetch your member data.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await handleWelcome(member);
    await interaction.editReply("✅ Preview sent to the configured welcome channel.");
    return;
  }

  if (sub === "disable") {
    await setWelcomeConfig(interaction.guild.id, { welcomeChannelId: "", welcomeMessage: "" });
    await interaction.reply({ content: "✅ Welcome messages disabled.", ephemeral: true });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch = config.welcomeChannelId
      ? `<#${config.welcomeChannelId}>`
      : "Not set";

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`⚙️ // WELCOME CONFIG`)
      .addFields(
        { name: "CHANNEL",  value: ch },
        { name: "MESSAGE",  value: config.welcomeMessage || "Not set" },
        { name: "STATUS",   value: config.welcomeChannelId && config.welcomeMessage ? "✅ Active" : "❌ Inactive" },
      )
      .setFooter({ text: BOT_NAME })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
