import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

const DURATION_OPTIONS = [
  { name: "60 seconds", value: 60 },
  { name: "5 minutes", value: 300 },
  { name: "10 minutes", value: 600 },
  { name: "1 hour", value: 3600 },
  { name: "1 day", value: 86400 },
  { name: "1 week", value: 604800 },
];

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout (mute) a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to mute").setRequired(true)
  )
  .addIntegerOption((option) => {
    const opt = option
      .setName("duration")
      .setDescription("Duration of the timeout")
      .setRequired(true);
    for (const d of DURATION_OPTIONS) {
      opt.addChoices({ name: d.name, value: d.value });
    }
    return opt;
  })
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the mute").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const durationSeconds = interaction.options.getInteger("duration", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(target.id);

  if (!member) {
    await interaction.reply({ content: "That user is not in this server.", ephemeral: true });
    return;
  }

  if (!member.moderatable) {
    await interaction.reply({ content: "I cannot mute this user. They may have a higher role than me.", ephemeral: true });
    return;
  }

  const durationLabel = DURATION_OPTIONS.find((d) => d.value === durationSeconds)?.name ?? `${durationSeconds}s`;

  try {
    await member.timeout(durationSeconds * 1000, `${reason} | Muted by ${interaction.user.tag}`);
    await interaction.reply({
      content: `✅ **${target.tag}** has been muted for **${durationLabel}**.\n**Reason:** ${reason}`,
    });
  } catch (err) {
    await interaction.reply({ content: `Failed to mute user: ${String(err)}`, ephemeral: true });
  }
}
