import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type TextChannel,
  type Role,
  MessageFlags,
} from "discord.js";
import { updateGuildConfig, getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Manage the verification gate")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Post a verification button in this channel and assign a role on click")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role to assign when a member verifies").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Disable the verification gate")
  )
  .addSubcommand((sub) =>
    sub.setName("status")
      .setDescription("Show current verification configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const role = interaction.options.getRole("role", true) as Role;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_gate")
        .setLabel("✅  Verify")
        .setStyle(ButtonStyle.Success),
    );

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `🔐  Verification  ·  ${BOT_NAME}` })
      .setTitle(`Welcome to ${interaction.guild.name}`)
      .setDescription(`Click the button below to verify and gain access to the server.\n\nBy verifying, you agree to follow the server rules.`)
      .setThumbnail(interaction.guild.iconURL() ?? null)
      .setTimestamp();

    await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });

    await updateGuildConfig(interaction.guild.id, { verifyRoleId: role.id });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription(`✅ Verification gate set up. Members will receive ${role} on click.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { verifyRoleId: "" });
    await interaction.reply({
      content: "Verification gate disabled.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const role   = config.verifyRoleId ? `<@&${config.verifyRoleId}>` : "Not configured";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle("🔐 Verification Status")
          .addFields({ name: "Verify Role", value: role }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
