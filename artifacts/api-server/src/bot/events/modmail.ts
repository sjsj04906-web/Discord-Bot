import {
  type Message,
  EmbedBuilder,
  ChannelType,
  type TextChannel,
  type Guild,
  PermissionFlagsBits,
} from "discord.js";
import { getGuildConfig, openModMailSession, closeModMailSession, getModMailSessionByUser, getModMailSessionByChannel } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const MAIL_CHANNEL_PREFIX = "mail-";

// ── Forward a DM to the mod channel ────────────────────────────────────────────
async function forwardDmToMod(message: Message, guild: Guild): Promise<void> {
  const config = await getGuildConfig(guild.id);
  if (!config.modMailChannelId) return;

  const modChannel = guild.channels.cache.get(config.modMailChannelId) as TextChannel | undefined;
  if (!modChannel) return;

  const user   = message.author;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const chanName  = `${MAIL_CHANNEL_PREFIX}${safeName}`;

  // Find or create the user's mail channel
  let mailChannel = guild.channels.cache.find(
    (c) => c.name === chanName && c.isTextBased()
  ) as TextChannel | undefined;

  const existingSession = await getModMailSessionByUser(guild.id, user.id);

  if (!mailChannel || !existingSession) {
    // Create a new private channel under the mod mail channel's category
    const category = modChannel.parentId;

    const modRoles = guild.roles.cache.filter((r) =>
      ["mod", "moderator", "staff", "admin"].some((h) => r.name.toLowerCase().includes(h))
    );

    mailChannel = await guild.channels.create({
      name: chanName,
      type: ChannelType.GuildText,
      parent: category ?? undefined,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: message.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ...modRoles.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
      topic: `Mod mail from ${user.tag} (${user.id})`,
    }) as TextChannel;

    await openModMailSession(guild.id, user.id, user.tag, mailChannel.id);

    // Opening notice
    const openEmbed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`📬 // MOD MAIL — ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`New mod mail thread opened by ${user}.`)
      .addFields(
        { name: "USER ID",  value: `\`${user.id}\``, inline: true },
        { name: "ACCOUNT",  value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `Use /modmail reply to respond • /modmail close to close` })
      .setTimestamp();

    await mailChannel.send({ embeds: [openEmbed] });

    // Notify user the thread is open
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle(`📬 ${BOT_NAME} // MOD MAIL OPENED`)
          .setDescription(`Your message has been received by the moderation team of **${guild.name}**. They will respond here shortly.`)
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  // Forward the message
  const fwdEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL() })
    .setDescription(message.content || "_[no text content]_")
    .setTimestamp();

  if (message.attachments.size > 0) {
    fwdEmbed.addFields({
      name: "ATTACHMENTS",
      value: message.attachments.map((a) => a.url).join("\n").slice(0, 500),
    });
  }

  await mailChannel.send({ embeds: [fwdEmbed] }).catch(() => {});
}

// ── Forward a mod reply from the mail channel back to the user ─────────────────
async function forwardModReplyToUser(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.channel.isTextBased()) return;
  if (!(message.channel as TextChannel).name?.startsWith(MAIL_CHANNEL_PREFIX)) return;

  const session = await getModMailSessionByChannel(message.channelId);
  if (!session || session.status === "closed") return;

  const user = await message.client.users.fetch(session.userId).catch(() => null);
  if (!user) return;

  const replyEmbed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({ name: `${BOT_NAME} // Mod Team`, iconURL: message.guild.iconURL() ?? undefined })
    .setDescription(message.content || "_[no text content]_")
    .setTimestamp();

  await user.send({ embeds: [replyEmbed] }).catch(() => {
    message.react("❌").catch(() => {});
  });

  await message.react("✅").catch(() => {});
}

// ── Main DM handler ────────────────────────────────────────────────────────────
export async function handleDirectMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.guild) return; // not a DM

  // Find the first guild where this bot has a modmail channel configured
  for (const guild of message.client.guilds.cache.values()) {
    const config = await getGuildConfig(guild.id).catch(() => null);
    if (config?.modMailChannelId) {
      await forwardDmToMod(message, guild).catch(() => {});
      return;
    }
  }
}

// ── Mod channel message handler (reply forwarding) ─────────────────────────────
export async function handleModMailReply(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;
  const ch = message.channel as TextChannel;
  if (!ch.name?.startsWith(MAIL_CHANNEL_PREFIX)) return;

  await forwardModReplyToUser(message).catch(() => {});
}
