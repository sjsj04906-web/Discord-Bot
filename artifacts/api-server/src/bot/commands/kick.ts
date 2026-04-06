import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to kick").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the kick").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "Entity not found in this network.", ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: "Cannot disconnect this entity — insufficient clearance.", ephemeral: true });
    return;
  }

  try {
    await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(THEME.kick)
      .setTitle("⚡ // ENTITY DISCONNECTED")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "TARGET", value: `${target} \`${target.tag}\``, inline: true },
        { name: "OPERATOR", value: `${interaction.user}`, inline: true },
        { name: "REASON", value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.kick(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "⚡ KICK // FORCEFUL DISCONNECT",
      color: THEME.kick,
      target,
      moderator: interaction.user,
      reason,
    });
  } catch (err) {
    await interaction.reply({ content: `Execution failed: ${String(err)}`, ephemeral: true });
  }
}
