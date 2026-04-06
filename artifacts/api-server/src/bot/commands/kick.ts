import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";

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
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: "I cannot kick this user — they may outrank me.", ephemeral: true });
    return;
  }

  try {
    await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("👟 Member Kicked")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "User", value: `${target} \`${target.tag}\``, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Reason", value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.kick(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "👟 Kick",
      color: Colors.Orange,
      target,
      moderator: interaction.user,
      reason,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to kick: ${String(err)}`, ephemeral: true });
  }
}
