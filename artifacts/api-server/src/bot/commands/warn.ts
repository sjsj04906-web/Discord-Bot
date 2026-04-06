import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { warnings } from "../warnings.js";
import { sendModLog } from "../modlog.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue a warning to a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to warn").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the warning").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const key = `${interaction.guild.id}:${target.id}`;
  const existing = warnings.get(key) ?? [];
  existing.push({ reason, moderator: interaction.user.tag, timestamp: new Date().toISOString() });
  warnings.set(key, existing);

  const embed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle("⚠️ Warning Issued")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target} \`${target.tag}\``, inline: true },
      { name: "Moderator", value: `${interaction.user}`, inline: true },
      { name: "Warning #", value: String(existing.length), inline: true },
      { name: "Reason", value: reason },
    )
    .setFooter({ text: `ID: ${target.id}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  log.warn(target.tag, interaction.guild.name, existing.length, reason);

  await sendModLog(interaction.guild, {
    action: "⚠️ Warning",
    color: Colors.Yellow,
    target,
    moderator: interaction.user,
    reason,
    extra: { "Total Warnings": String(existing.length) },
  });

  try {
    await target.send(
      `⚠️ You received a warning in **${interaction.guild.name}**.\n**Reason:** ${reason}\nThis is warning **#${existing.length}**.`
    );
  } catch {
    // DMs closed
  }
}
