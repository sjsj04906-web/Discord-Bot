import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { sendModLog } from "../modlog.js";
import { logCase } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";
import { log } from "../display.js";

export const data = new SlashCommandBuilder()
  .setName("softban")
  .setDescription("Ban then immediately unban a member to delete their messages without a permanent ban")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to softban").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the softban").setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName("delete_days")
      .setDescription("Days of messages to delete (1–7, default 1)")
      .setMinValue(1).setMaxValue(7).setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target     = interaction.options.getUser("user", true);
  const reason     = interaction.options.getString("reason") ?? "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 1;
  const member     = interaction.guild.members.cache.get(target.id);

  if (member && !member.bannable) {
    await interaction.reply({ content: "I don't have permission to ban this member.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    await interaction.guild.members.ban(target, {
      reason: `[Softban] ${reason} — by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86_400,
    });
    await interaction.guild.members.unban(target, `Softban unban — by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(THEME.warning)
      .setAuthor({ name: `🔨  Member Softbanned  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Member",    value: `${target}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Messages Deleted", value: `${deleteDays} day(s)`, inline: true },
        { name: "Reason",    value: reason },
      )
      .setFooter({ text: `ID: ${target.id} · Softban — member may rejoin` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    log.ban(target.tag, interaction.guild.name, `[softban] ${reason}`);

    await sendModLog(interaction.guild, {
      action: "🔨  Member Softbanned",
      color: THEME.warning,
      target,
      moderator: interaction.user,
      reason,
      extra: { "Messages Deleted": `${deleteDays} day(s)` },
      adminOnly: true,
    });

    await logCase(
      interaction.guild.id,
      "softban",
      target.id,
      target.tag,
      interaction.user.id,
      interaction.user.tag,
      reason,
    );

    // DM the user
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warning)
          .setAuthor({ name: `🔨  ${BOT_NAME}  ·  Softban Notice` })
          .setTitle(interaction.guild.name)
          .setDescription(`You have been softbanned from **${interaction.guild.name}**.\n\nYour recent messages have been cleared. You may rejoin with a fresh invite if you wish to return.`)
          .addFields({ name: "Reason", value: reason })
          .setTimestamp(),
      ],
    }).catch(() => {});
  } catch (err) {
    await interaction.editReply({ content: `Failed to softban member: ${String(err)}` });
  }
}
