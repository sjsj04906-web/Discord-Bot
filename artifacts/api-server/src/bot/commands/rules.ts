import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { BOT_NAME } from "../theme.js";

// ── Server rules ──────────────────────────────────────────────────────────────
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

// ── Embed builder ─────────────────────────────────────────────────────────────
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
    .addFields(
      ...RULES.map((r) => ({ name: r.title, value: r.body, inline: false })),
    )
    .addFields({
      name:  "\u200b",
      value: "If you have questions or need to report an issue, use **/modmail** or reach out to a staff member directly.",
    })
    .setFooter({ text: `${BOT_NAME}  ·  Last updated` })
    .setTimestamp();
}

// ── Command ───────────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Display the server rules")
  .addSubcommand((sub) =>
    sub.setName("post")
      .setDescription("Post the rules embed in this channel (mod only)")
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

  if (sub === "post") {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    const isStaff = isOwner || (member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false);

    if (!isStaff) {
      await interaction.reply({
        content: "You need the **Manage Messages** permission to post the rules.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildRulesEmbed(
      interaction.guild.name,
      interaction.guild.iconURL(),
    );

    await (interaction.channel as TextChannel).send({ embeds: [embed] });
    await interaction.reply({ content: "✅ Rules posted.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "dm") {
    const embed = buildRulesEmbed(
      interaction.guild.name,
      interaction.guild.iconURL(),
    );

    const sent = await interaction.user.send({ embeds: [embed] }).catch(() => null);

    if (!sent) {
      await interaction.reply({
        content: "❌ I couldn't send you a DM. Make sure you have DMs enabled from server members.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: "📬 Rules sent to your DMs!",
      flags: MessageFlags.Ephemeral,
    });
  }
}
