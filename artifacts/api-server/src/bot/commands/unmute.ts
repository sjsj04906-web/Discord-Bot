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
  .setName("unmute")
  .setDescription("Remove a timeout from a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to unmute").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }
  if (!member.isCommunicationDisabled()) {
    await interaction.reply({ content: "That user is not currently muted.", ephemeral: true });
    return;
  }

  try {
    await member.timeout(null, `Unmuted by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🔊 Member Unmuted")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "User", value: `${target} \`${target.tag}\``, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.unmute(target.tag, interaction.guild.name);

    await sendModLog(interaction.guild, {
      action: "🔊 Unmute",
      color: Colors.Green,
      target,
      moderator: interaction.user,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to unmute: ${String(err)}`, ephemeral: true });
  }
}
