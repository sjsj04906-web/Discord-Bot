import {
  type Message,
  type PartialMessage,
  EmbedBuilder,
  ChannelType,
  type TextChannel,
  type Guild,
  PermissionFlagsBits,
} from "discord.js";
import {
  getGuildConfig,
  openModMailSession,
  closeModMailSession,
  getModMailSessionByUser,
  getModMailSessionByChannel,
} from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const MAIL_CHANNEL_PREFIX = "mail-";

// ── Forward a DM to the mod channel ──────────────────────────────────────────
async function forwardDmToMod(message: Message, guild: Guild): Promise<void> {
  const config = await getGuildConfig(guild.id);
  if (!config.modMailChannelId) return;

  // Use fetch — cache.get misses channels not yet cached after restart
  const modChannel = await guild.channels.fetch(config.modMailChannelId).catch(() => null) as TextChannel | null;
  if (!modChannel) return;

  const user = message.author;

  // Check for an existing open session in DB
  let existingSession = await getModMailSessionByUser(guild.id, user.id);

  // Re-use an existing open session if one exists
  let mailChannel: TextChannel | null = null;
  if (existingSession) {
    mailChannel = await guild.channels.fetch(existingSession.channelId).catch(() => null) as TextChannel | null;
    if (!mailChannel) {
      await closeModMailSession(existingSession.id);
      existingSession = null;
    }
  }

  // No open session — create an anonymous mail channel
  if (!mailChannel) {
    // Random 6-char case ID — reveals nothing about the sender
    const caseId  = Math.random().toString(36).slice(2, 8);
    const chanName = `${MAIL_CHANNEL_PREFIX}${caseId}`;
    const category = modChannel.parentId;

    const modRoles = guild.roles.cache.filter((r) =>
      ["mod", "moderator", "staff", "admin"].some((h) => r.name.toLowerCase().includes(h))
    );

    const permissionOverwrites: Parameters<Guild["channels"]["create"]>[0]["permissionOverwrites"] = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: message.client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    for (const role of modRoles.values()) {
      permissionOverwrites.push({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    if (modRoles.size === 0) {
      const adminRoles = guild.roles.cache.filter((r) => r.permissions.has(PermissionFlagsBits.Administrator));
      for (const role of adminRoles.values()) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      }
    }

    mailChannel = await guild.channels.create({
      name: chanName,
      type: ChannelType.GuildText,
      parent: category ?? undefined,
      permissionOverwrites,
      topic: `Anonymous mod mail thread — case ${caseId.toUpperCase()}`,
    }) as TextChannel;

    await openModMailSession(guild.id, user.id, user.tag, mailChannel.id);

    // Opening embed — no user identity shown to mods
    const openEmbed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `📬  Mod Mail Opened  ·  ${BOT_NAME}` })
      .setTitle(`Anonymous Thread — Case ${caseId.toUpperCase()}`)
      .setDescription("An anonymous member has opened a mod mail thread.\n\nReply by typing in this channel — every message is forwarded to them.\nUse `/modmail close` to resolve and archive this thread.")
      .setTimestamp();

    await mailChannel.send({ embeds: [openEmbed] });

    // Acknowledge to the user (no mod identity, no guild branding beyond name)
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `📬  Mod Mail  ·  ${BOT_NAME}` })
          .setTitle(`Message received — ${guild.name}`)
          .setDescription("Your message has been received anonymously by the moderation team. They will reply here shortly.\n\nYou can keep sending messages and they will all be forwarded.")
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  // Forward the message — no username or avatar shown
  const fwdEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "Anonymous User" })
    .setDescription(message.content || "_[no text content]_")
    .setTimestamp();

  if (message.attachments.size > 0) {
    fwdEmbed.addFields({
      name: "Attachments",
      value: message.attachments.map((a) => a.url).join("\n").slice(0, 500),
    });
  }

  await mailChannel.send({ embeds: [fwdEmbed] }).catch(() => {});
}

// ── Forward a mod reply back to the user ──────────────────────────────────────
async function forwardModReplyToUser(message: Message): Promise<void> {
  if (!message.guild || !message.content) return;

  const session = await getModMailSessionByChannel(message.channelId);
  if (!session || session.status === "closed") return;

  const user = await message.client.users.fetch(session.userId).catch(() => null);
  if (!user) return;

  const replyEmbed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({ name: `Mod Team  ·  ${message.guild.name}`, iconURL: message.guild.iconURL() ?? undefined })
    .setDescription(message.content)
    .setTimestamp();

  const sent = await user.send({ embeds: [replyEmbed] }).catch(() => null);
  await message.react(sent ? "✅" : "❌").catch(() => {});
}

// ── DM handler (called from raw event in index.ts) ────────────────────────────
export async function handleDirectMessage(message: Message | PartialMessage): Promise<void> {
  const msg = message.partial ? await message.fetch().catch(() => null) : message;
  if (!msg || !msg.author || msg.author.bot) return;
  if (msg.guild) return;

  for (const guild of msg.client.guilds.cache.values()) {
    const config = await getGuildConfig(guild.id).catch(() => null);
    if (config?.modMailChannelId) {
      await forwardDmToMod(msg as Message, guild).catch((err) => {
        console.error("[modmail] forwardDmToMod error:", err);
      });
      return;
    }
  }
}

// ── Guild message handler: forward mod replies in mail- channels ──────────────
export async function handleModMailReply(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  const ch = message.channel as TextChannel;
  if (!ch.name?.startsWith(MAIL_CHANNEL_PREFIX)) return;

  await forwardModReplyToUser(message).catch(() => {});
}

