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
  .setName("unlock")
  .setDescription("Unlock a previously locked channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Channel to unlock (defaults to current)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const target = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;

  try {
    await target.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    }, { reason: `Unlocked by ${interaction.user.tag}` });

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🔓 Channel Unlocked")
      .setDescription(`${target} is now open. Members can send messages again.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.unlock(target.name, interaction.guild.name);
  } catch (err) {
    await interaction.reply({ content: `Failed to unlock channel: ${String(err)}`, ephemeral: true });
  }
}
