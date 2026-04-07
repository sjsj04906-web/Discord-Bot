import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../display.js";
import { sendModLog } from "../modlog.js";
import { THEME, BOT_NAME } from "../theme.js";

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
    o.setName("reason").setDescription("Reason for the mute").setRequired(false).setAutocomplete(true)
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
    await interaction.reply({ content: "That member isn't in this server.", ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({ content: "I don't have permission to mute this member.", ephemeral: true });
    return;
  }

  try {
    await member.timeout(durationSecs * 1000, `${reason} — muted by ${interaction.user.tag}`);

    const liftAt = Math.floor((Date.now() + durationSecs * 1000) / 1000);

    const embed = new EmbedBuilder()
      .setColor(THEME.mute)
      .setAuthor({ name: `🔇  Member Muted  ·  ${BOT_NAME}` })
      .setTitle(target.tag)
      .setURL(`https://discord.com/users/${target.id}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Member",    value: `${target}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Duration",  value: durationLabel, inline: true },
      )
      .addFields(
        { name: "Expires",   value: `<t:${liftAt}:R>`, inline: true },
        { name: "Reason",    value: reason },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    log.mute(target.tag, interaction.guild.name, durationLabel, reason);

    await sendModLog(interaction.guild, {
      action: "🔇  Member Muted",
      color: THEME.mute,
      target,
      moderator: interaction.user,
      reason,
      duration: durationLabel,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to mute member: ${String(err)}`, ephemeral: true });
  }
}
