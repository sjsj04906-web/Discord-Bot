import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";
import { randomKickLine } from "../utils/savagelines.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Forcibly remove a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The member to remove").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for removal").setRequired(false).setAutocomplete(true)
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
    await interaction.reply({ content: "That member is not in this server.", ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: "I cannot remove this member — they outrank me.", ephemeral: true });
    return;
  }

  try {
    await member.kick(`${reason} — ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(THEME.kick)
      .setAuthor({ name: `⚡  Member Removed  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setDescription(`> *"${randomKickLine()}"*`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "◈ Member",    value: `${target}`,           inline: true },
        { name: "◈ Moderator", value: `${interaction.user}`, inline: true },
        { name: "◈ Reason",    value: reason },
      )
      .setFooter({ text: `User ID: ${target.id}  ·  ${BOT_NAME} ◆ Moderation` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.kick(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "⚡  Member Removed",
      color: THEME.kick,
      target,
      moderator: interaction.user,
      reason,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to remove member: ${String(err)}`, ephemeral: true });
  }
}
