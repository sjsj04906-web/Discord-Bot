import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { setWelcomeConfig, getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { handleWelcome } from "../events/welcome.js";

const VARIABLES = "`{user}` `{username}` `{tag}` `{userid}` `{server}` `{membercount}` `{mention}`";

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
      .setDescription("Set the custom welcome message text (supports variables)")
      .addStringOption((o) =>
        o.setName("text")
          .setDescription(`Use ${VARIABLES} as placeholders`)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("test")
      .setDescription("Preview the welcome message as if you just joined")
  )
  .addSubcommand((sub) =>
    sub.setName("reset")
      .setDescription("Reset the message back to the default")
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Disable welcome messages entirely")
  )
  .addSubcommand((sub) =>
    sub.setName("status")
      .setDescription("Show the current welcome configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── Set channel ────────────────────────────────────────────────────────────
  if (sub === "channel") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await setWelcomeConfig(interaction.guild.id, { welcomeChannelId: ch.id });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `👋  Welcome  ·  ${BOT_NAME}` })
          .setDescription(`Welcome messages will be sent to ${ch}.`)
          .setFooter({ text: "Customise the message with /welcome message" }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Set message ───────────────────────────────────────────────────────────
  if (sub === "message") {
    const text = interaction.options.getString("text", true);
    await setWelcomeConfig(interaction.guild.id, { welcomeMessage: text });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `👋  Welcome  ·  ${BOT_NAME}` })
          .setTitle("Message updated")
          .setDescription(`\`\`\`\n${text}\n\`\`\``)
          .setFooter({ text: `Variables: ${VARIABLES}` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Test ──────────────────────────────────────────────────────────────────
  if (sub === "test") {
    const member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!member) {
      await interaction.reply({ content: "Could not fetch your member data.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await handleWelcome(member);
    await interaction.editReply("✅ Preview sent to the welcome channel.");
    return;
  }

  // ── Reset to default ──────────────────────────────────────────────────────
  if (sub === "reset") {
    await setWelcomeConfig(interaction.guild.id, { welcomeMessage: "" });
    await interaction.reply({
      content: "✅ Welcome message reset to the default.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Disable ───────────────────────────────────────────────────────────────
  if (sub === "disable") {
    await setWelcomeConfig(interaction.guild.id, { welcomeChannelId: "", welcomeMessage: "" });
    await interaction.reply({ content: "🔇 Welcome messages disabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch      = config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "_Auto-detect by channel name_";
    const msg     = config.welcomeMessage   || "_Default message_";
    const active  = config.welcomeChannelId ? "✅ Active" : "🔇 Inactive (no channel set)";

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `👋  Welcome  ·  ${BOT_NAME}` })
          .setTitle("Configuration")
          .addFields(
            { name: "Status",  value: active, inline: true },
            { name: "Channel", value: ch,     inline: true },
            { name: "Message", value: msg },
            { name: "Variables", value: VARIABLES },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
