import {
  EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, type Message, type AnyThreadChannel,
  ChannelType,
} from "discord.js";
import { BOT_NAME } from "../theme.js";
import { getGuildConfig, createSuggestion, updateSuggestionMessageId } from "../db.js";

function buildSuggestionEmbed(
  suggId: number,
  content: string,
  userId: string,
  userTag: string,
  avatarURL?: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `💡  Suggestion #${suggId}  ·  ${BOT_NAME}`, iconURL: avatarURL })
    .setDescription(content)
    .addFields(
      { name: "Submitted by", value: `<@${userId}> \`${userTag}\``, inline: true },
      { name: "Status",       value: "⏳ Pending",                  inline: true },
    )
    .setFooter({ text: `ID: ${suggId}` })
    .setTimestamp();
}

function buildApprovalRow(suggId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_approve_btn_${suggId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`suggest_deny_btn_${suggId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );
}

// ── Text channel handler ────────────────────────────────────────────────────────
// Called when a member posts in the configured text suggestion channel.
// The raw message is deleted and replaced with a formatted embed + discussion thread.
export async function handleSuggestionMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const content = message.content.trim();
  if (!content) return;

  if (content.length < 10) {
    const warn = await message.reply({
      content: "❌ Your suggestion is too short — please write at least 10 characters.",
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 6_000);
    await message.delete().catch(() => {});
    return;
  }

  await message.delete().catch(() => {});

  const suggId = await createSuggestion(
    message.guild.id,
    message.channelId,
    "pending",
    message.author.id,
    message.author.tag,
    content,
  );

  const embed = buildSuggestionEmbed(suggId, content, message.author.id, message.author.tag, message.author.displayAvatarURL());
  const row   = buildApprovalRow(suggId);

  const posted = await (message.channel as import("discord.js").TextChannel)
    .send({ embeds: [embed], components: [row] })
    .catch(() => null);
  if (!posted) return;

  await updateSuggestionMessageId(suggId, posted.id);

  if (
    message.channel.type === ChannelType.GuildText &&
    message.channel.permissionsFor(message.guild.members.me!)?.has("CreatePublicThreads")
  ) {
    await posted.startThread({
      name: `Suggestion #${suggId}`,
      autoArchiveDuration: 1440,
    }).catch(() => {});
  }
}

// ── Forum channel handler ───────────────────────────────────────────────────────
// Called on ThreadCreate when the thread's parent is the configured suggestion forum channel.
// The bot posts the approval embed as the first message inside the new thread.
export async function handleSuggestionThread(thread: AnyThreadChannel, newlyCreated: boolean): Promise<void> {
  if (!newlyCreated || !thread.guildId || !thread.parentId) return;

  const config = await getGuildConfig(thread.guildId).catch(() => null);
  if (!config?.suggestionChannelId || thread.parentId !== config.suggestionChannelId) return;

  await new Promise((r) => setTimeout(r, 800));

  const starterMsg = await thread.fetchStarterMessage().catch(() => null);
  const content    = starterMsg?.content?.trim() || thread.name;
  const userId     = thread.ownerId ?? starterMsg?.author.id ?? "";
  const userTag    = starterMsg?.author.tag ?? thread.name;
  const avatarURL  = starterMsg?.author.displayAvatarURL();

  const suggId = await createSuggestion(
    thread.guildId,
    thread.id,
    "pending",
    userId,
    userTag,
    content,
  );

  const embed = buildSuggestionEmbed(suggId, content, userId, userTag, avatarURL);
  const row   = buildApprovalRow(suggId);

  const posted = await thread.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!posted) return;

  await updateSuggestionMessageId(suggId, posted.id);
}
