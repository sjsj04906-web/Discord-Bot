import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";

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
    await interaction.reply({ content: "That member isn't in this server.", ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: "I don't have permission to kick this member.", ephemeral: true });
    return;
  }

  try {
    await member.kick(`${reason} — kicked by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(THEME.kick)
      .setAuthor({ name: `⚡  Member Kicked  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Member",    value: `${target}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
      )
      .addFields({ name: "Reason", value: reason })
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.kick(target.tag, interaction.guild.name, reason);

    await sendModLog(interaction.guild, {
      action: "⚡  Member Kicked",
      color: THEME.kick,
      target,
      moderator: interaction.user,
      reason,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to kick member: ${String(err)}`, ephemeral: true });
  }
}
