import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  PermissionOverwrites,
  OverwriteType,
  type ChatInputCommandInteraction,
  type TextChannel,
  type Role,
  type GuildChannel,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { addReactionRole } from "../db.js";
import { BOT_NAME } from "../theme.js";

const GATE_EMOJI = "✅";

// Channels where @everyone keeps read access regardless
const EXEMPT_NAMES = ["rules", "welcome", "verify", "start-here", "read-me", "readme"];

// ── Rules list ────────────────────────────────────────────────────────────────
const RULES = [
  {
    title: "1 · Respect Everyone",
    body:  "Treat all members with respect. Harassment, hate speech, slurs, discrimination, or personal attacks of any kind will not be tolerated.",
  },
  {
    title: "2 · No Spam or Flooding",
    body:  "Do not spam messages, reactions, mentions, or commands. This includes wall-of-text messages, repeated characters, and excessive use of caps.",
  },
  {
    title: "3 · Keep It On Topic",
    body:  "Use the correct channels for your content. Off-topic discussions belong in designated channels. Read the channel descriptions before posting.",
  },
  {
    title: "4 · No NSFW or Disturbing Content",
    body:  "Explicit, graphic, or NSFW content is strictly prohibited outside of designated age-restricted channels (if any exist). This applies to profile pictures, usernames, and links.",
  },
  {
    title: "5 · No Advertising or Self-Promotion",
    body:  "Do not advertise other Discord servers, social media, YouTube channels, or any external services without explicit staff approval.",
  },
  {
    title: "6 · No Doxxing or Privacy Violations",
    body:  "Sharing personal information about another person without their consent — including real names, addresses, phone numbers, or photos — is an immediate permanent ban.",
  },
  {
    title: "7 · No Impersonation",
    body:  "Do not impersonate other members, staff, public figures, or bots. This includes similar usernames, avatars, or copying someone's display style to mislead others.",
  },
  {
    title: "8 · Follow Discord's Terms of Service",
    body:  "All members must comply with [Discord's Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines) at all times.",
  },
  {
    title: "9 · Staff Decisions Are Final",
    body:  "Respect all decisions made by moderators and admins. If you disagree with an action taken, reach out privately via modmail — do not argue publicly in channels.",
  },
];

// ── Embed ─────────────────────────────────────────────────────────────────────
function buildRulesEmbed(guildName: string, guildIcon: string | null, withGate: boolean): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00C4CC)
    .setAuthor({ name: `📜  Server Rules  ·  ${BOT_NAME}` })
    .setTitle(`${guildName} — Rules & Guidelines`)
    .setThumbnail(guildIcon)
    .setDescription(
      "By participating in this server you agree to abide by the following rules. " +
      "Violations may result in warnings, mutes, kicks, or bans depending on severity.\n\u200b"
    )
    .addFields(...RULES.map((r) => ({ name: r.title, value: r.body, inline: false })))
    .addFields({
      name:  "\u200b",
      value: withGate
        ? `React with ${GATE_EMOJI} below to accept these rules and gain access to the server.`
        : "If you have questions or need to report an issue, use **/modmail** or reach out to a staff member directly.",
    })
    .setFooter({ text: `${BOT_NAME}  ·  Last updated` })
    .setTimestamp();
}

// ── Command ───────────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Display or configure the server rules")
  .addSubcommand((sub) =>
    sub.setName("post")
      .setDescription("Post the rules embed in this channel")
      .addRoleOption((o) =>
        o.setName("gate_role")
          .setDescription("Role granted when a member reacts ✅ — gates access to other channels")
          .setRequired(false)
      )
      .addBooleanOption((o) =>
        o.setName("lock_channels")
          .setDescription("Automatically restrict all non-exempt channels to require the gate role (default: false)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("dm")
      .setDescription("Send the rules to your DMs")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /rules dm ────────────────────────────────────────────────────────────────
  if (sub === "dm") {
    const embed = buildRulesEmbed(interaction.guild.name, interaction.guild.iconURL(), false);
    const sent  = await interaction.user.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      await interaction.reply({
        content: "❌ I couldn't send you a DM — make sure your DMs are open.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({ content: "📬 Rules sent to your DMs!", flags: MessageFlags.Ephemeral });
    return;
  }

  // ── /rules post ──────────────────────────────────────────────────────────────
  const member = interaction.guild.members.cache.get(interaction.user.id);
  const isStaff = interaction.guild.ownerId === interaction.user.id
    || (member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false);

  if (!isStaff) {
    await interaction.reply({
      content: "You need the **Manage Server** permission to post the rules.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gateRole    = interaction.options.getRole("gate_role") as Role | null;
  const lockChannels = interaction.options.getBoolean("lock_channels") ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rulesChannel = interaction.channel as TextChannel;
  const embed = buildRulesEmbed(interaction.guild.name, interaction.guild.iconURL(), !!gateRole);
  const rulesMsg = await rulesChannel.send({ embeds: [embed] });

  // Add ✅ reaction if using the gate
  if (gateRole) {
    await rulesMsg.react(GATE_EMOJI).catch(() => {});

    // Register in the reaction roles table — existing handleReactionAdd picks it up automatically
    await addReactionRole(
      interaction.guild.id,
      rulesMsg.id,
      rulesChannel.id,
      GATE_EMOJI,
      gateRole.id,
      gateRole.name,
    ).catch(() => {});
  }

  // Optional: lock all non-exempt channels
  const lockedChannels: string[] = [];
  const skippedChannels: string[] = [];

  if (gateRole && lockChannels) {
    const everyone = interaction.guild.roles.everyone;

    const textChannels = interaction.guild.channels.cache.filter(
      (ch): ch is GuildChannel =>
        (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
        !ch.parentId // skip channels in categories for now, handle below
          ? true
          : (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement),
    );

    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) continue;
      const tc = ch as TextChannel;

      const isExempt =
        tc.id === rulesChannel.id ||
        EXEMPT_NAMES.some((n) => tc.name.toLowerCase().includes(n));

      if (isExempt) {
        // Exempt: make sure @everyone can view
        await tc.permissionOverwrites.edit(everyone, { ViewChannel: true }).catch(() => {});
        skippedChannels.push(`<#${tc.id}>`);
      } else {
        // Locked: deny @everyone, allow gate role
        await tc.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
        await tc.permissionOverwrites.edit(gateRole,  { ViewChannel: true  }).catch(() => {});
        lockedChannels.push(`<#${tc.id}>`);
      }
    }
  }

  // ── Summary reply ─────────────────────────────────────────────────────────
  const lines: string[] = ["✅ Rules posted."];

  if (gateRole) {
    lines.push(`\n**Gate role:** ${gateRole} — members get it by reacting ${GATE_EMOJI} to the rules message.`);
  }

  if (lockChannels && gateRole) {
    if (lockedChannels.length > 0)
      lines.push(`\n**Locked** (require ${gateRole.name}):\n${lockedChannels.join(", ")}`);
    if (skippedChannels.length > 0)
      lines.push(`\n**Left open** (exempt):\n${skippedChannels.join(", ")}`);
  } else if (lockChannels && !gateRole) {
    lines.push("\n⚠️ No gate role provided — channel locking skipped.");
  }

  await interaction.editReply({ content: lines.join("") });
}
