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
      .setColor(THEME.unlock)
      .setTitle("🔓 // CHANNEL UNSEALED")
      .setDescription(`${target} is now open. Transmissions permitted.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.unlock(target.name, interaction.guild.name);
  } catch (err) {
    await interaction.reply({ content: `Failed: ${String(err)}`, ephemeral: true });
  }
}
