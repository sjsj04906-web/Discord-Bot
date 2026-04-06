import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";

const DURATIONS = [
  { name: "60 seconds", value: 60 },
  { name: "5 minutes",  value: 300 },
  { name: "10 minutes", value: 600 },
  { name: "1 hour",     value: 3600 },
  { name: "6 hours",    value: 21600 },
  { name: "12 hours",   value: 43200 },
  { name: "1 day",      value: 86400 },
  { name: "1 week",     value: 604800 },
];

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout (mute) a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName("user").setDescription("The user to mute").setRequired(true)
  )
  .addIntegerOption((o) => {
    const opt = o.setName("duration").setDescription("Timeout duration").setRequired(true);
    for (const d of DURATIONS) opt.addChoices({ name: d.name, value: d.value });
    return opt;
  })
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the mute").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const durationSecs = interaction.options.getInteger("duration", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const durationLabel = DURATIONS.find((d) => d.value === durationSecs)?.name ?? `${durationSecs}s`;

  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);
  if (!member) {
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({ content: "I cannot mute this user — they may outrank me.", ephemeral: true });
    return;
  }

  try {
    await member.timeout(durationSecs * 1000, `${reason} | Muted by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle("🔇 Member Muted")
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "User", value: `${target} \`${target.tag}\``, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Duration", value: durationLabel, inline: true },
        { name: "Reason", value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.mute(target.tag, interaction.guild.name, durationLabel, reason);

    await sendModLog(interaction.guild, {
      action: "🔇 Mute (Timeout)",
      color: Colors.Purple,
      target,
      moderator: interaction.user,
      reason,
      duration: durationLabel,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to mute: ${String(err)}`, ephemeral: true });
  }
}
