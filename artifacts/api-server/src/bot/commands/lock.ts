import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { log } from "../display.js";

export const data = new SlashCommandBuilder()
  .setName("lock")
  .setDescription("Lock a channel so only moderators can send messages")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Channel to lock (defaults to current)").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for locking").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  try {
    await target.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    }, { reason: `${reason} | Locked by ${interaction.user.tag}` });

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("🔒 Channel Locked")
      .setDescription(`${target} has been locked. Only moderators can send messages.`)
      .addFields({ name: "Reason", value: reason })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.lock(target.name, interaction.guild.name);
  } catch (err) {
    await interaction.reply({ content: `Failed to lock channel: ${String(err)}`, ephemeral: true });
  }
}
