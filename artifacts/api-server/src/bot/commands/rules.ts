import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
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
function buildRulesEmbed(guildName: string, guildIcon: string | null): EmbedBuilder {
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
      value: `React with ${GATE_EMOJI} below to acknowledge these rules.`,
    })
    .setFooter({ text: `${BOT_NAME}  ·  Last updated` })
    .setTimestamp();
}

// ── Command ───────────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Post the server rules")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addRoleOption((o) =>
    o.setName("gate_role")
      .setDescription("Role granted when a member reacts ✅ — gates access to other channels")
      .setRequired(false)
  )
  .addBooleanOption((o) =>
    o.setName("lock_channels")
      .setDescription("Automatically restrict all non-exempt channels to require the gate role (default: false)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const gateRole     = interaction.options.getRole("gate_role") as Role | null;
  const lockChannels = interaction.options.getBoolean("lock_channels") ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rulesChannel = interaction.channel as TextChannel;
  const embed        = buildRulesEmbed(interaction.guild.name, interaction.guild.iconURL());
  const rulesMsg     = await rulesChannel.send({ embeds: [embed] });

  // Always add the ✅ reaction so members know to acknowledge
  await rulesMsg.react(GATE_EMOJI).catch(() => {});

  if (gateRole) {
    await addReactionRole(
      interaction.guild.id,
      rulesMsg.id,
      rulesChannel.id,
      GATE_EMOJI,
      gateRole.id,
      gateRole.name,
    ).catch(() => {});
  }

  const lockedChannels: string[] = [];
  const skippedChannels: string[] = [];

  if (gateRole && lockChannels) {
    const everyone = interaction.guild.roles.everyone;

    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) continue;
      const tc = ch as TextChannel;

      const isExempt =
        tc.id === rulesChannel.id ||
        EXEMPT_NAMES.some((n) => tc.name.toLowerCase().includes(n));

      if (isExempt) {
        await tc.permissionOverwrites.edit(everyone, { ViewChannel: true }).catch(() => {});
        skippedChannels.push(`<#${tc.id}>`);
      } else {
        await tc.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
        await tc.permissionOverwrites.edit(gateRole,  { ViewChannel: true  }).catch(() => {});
        lockedChannels.push(`<#${tc.id}>`);
      }
    }
  }

  const lines: string[] = ["✅ Rules posted."];
  if (gateRole) lines.push(`\n**Gate role:** ${gateRole} — members get it by reacting ${GATE_EMOJI}.`);
  if (lockChannels && gateRole) {
    if (lockedChannels.length)  lines.push(`\n**Locked:** ${lockedChannels.join(", ")}`);
    if (skippedChannels.length) lines.push(`\n**Left open:** ${skippedChannels.join(", ")}`);
  } else if (lockChannels && !gateRole) {
    lines.push("\n⚠️ No gate role provided — channel locking skipped.");
  }

  await interaction.editReply({ content: lines.join("") });
}
