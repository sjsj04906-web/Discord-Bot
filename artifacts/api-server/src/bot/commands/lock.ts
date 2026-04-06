import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { log } from "../display.js";
import { THEME } from "../theme.js";

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
      .setColor(THEME.lock)
      .setTitle("🔒 // CHANNEL LOCKED")
      .setDescription(`${target} has been sealed. Only operators may transmit.`)
      .addFields({ name: "REASON", value: reason })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.lock(target.name, interaction.guild.name);
  } catch (err) {
    await interaction.reply({ content: `Failed: ${String(err)}`, ephemeral: true });
  }
}
