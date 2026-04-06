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
  console.log(`[modmail] fetching parent channel ${config.modMailChannelId}...`);
  const modChannel = await guild.channels.fetch(config.modMailChannelId).catch((e) => { console.error("[modmail] fetch modChannel error:", e); return null; }) as TextChannel | null;
  if (!modChannel) { console.error("[modmail] modChannel not found or fetch failed"); return; }

  const user     = message.author;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const chanName = `${MAIL_CHANNEL_PREFIX}${safeName}`;

  // Check for an existing open session in DB
  let existingSession = await getModMailSessionByUser(guild.id, user.id);

  // If a session exists, re-use its channel (even if not in cache)
  let mailChannel: TextChannel | null = null;
  if (existingSession) {
    mailChannel = await guild.channels.fetch(existingSession.channelId).catch(() => null) as TextChannel | null;
    // If the channel was manually deleted, clear the stale session
    if (!mailChannel) {
      await closeModMailSession(existingSession.id);
      existingSession = null;
    }
  }

  // No open session — create a new mail channel
  if (!mailChannel) {
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
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    // If no mod roles matched, also allow the channel owner (administrator)
    // so at least someone can see it
    if (modRoles.size === 0) {
      const adminRoles = guild.roles.cache.filter((r) => r.permissions.has(PermissionFlagsBits.Administrator));
      for (const role of adminRoles.values()) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      }
    }

    console.log(`[modmail] creating channel ${chanName} in guild ${guild.name}...`);
    mailChannel = await guild.channels.create({
      name: chanName,
      type: ChannelType.GuildText,
      parent: category ?? undefined,
      permissionOverwrites,
      topic: `Mod mail thread · ${user.tag} (${user.id})`,
    }) as TextChannel;

    await openModMailSession(guild.id, user.id, user.tag, mailChannel.id);

    // Opening embed in the new mail channel
    const openEmbed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `📬  Mod Mail Opened  ·  ${BOT_NAME}` })
      .setTitle(user.tag)
      .setURL(`https://discord.com/users/${user.id}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "User ID",      value: `\`${user.id}\``, inline: true },
        { name: "Account Age",  value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setDescription("Reply in this channel — every message you send will be forwarded to the user's DMs.\nUse `/modmail close` to resolve and delete this thread.")
      .setTimestamp();

    await mailChannel.send({ embeds: [openEmbed] });

    // Acknowledge to the user
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `📬  Mod Mail  ·  ${BOT_NAME}` })
          .setTitle(`Message received — ${guild.name}`)
          .setDescription("Your message has been received by the moderation team. They will reply here shortly.\n\nYou can continue sending messages and they will all be forwarded.")
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  // Forward the message to the mail channel
  const fwdEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
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

// ── DM handler (called from index.ts MessageCreate for non-guild messages) ────
export async function handleDirectMessage(message: Message | PartialMessage): Promise<void> {
  // Fetch partial messages so author/content are available
  const msg = message.partial ? await message.fetch().catch(() => null) : message;
  if (!msg) { console.warn("[modmail] DM: fetch returned null"); return; }
  if (!msg.author) { console.warn("[modmail] DM: no author on message"); return; }
  if (msg.author.bot) return;
  if (msg.guild) return;

  console.log(`[modmail] DM received from ${msg.author.tag} — scanning ${msg.client.guilds.cache.size} guild(s)`);

  for (const guild of msg.client.guilds.cache.values()) {
    const config = await getGuildConfig(guild.id).catch(() => null);
    console.log(`[modmail]   guild=${guild.name} modMailChannelId="${config?.modMailChannelId}"`);
    if (config?.modMailChannelId) {
      await forwardDmToMod(msg as Message, guild).catch((err) => {
        console.error("[modmail] forwardDmToMod error:", err);
      });
      return;
    }
  }

  console.warn("[modmail] No guild has modMailChannelId configured — DM not forwarded");
}

// ── Guild message handler: forward mod replies in mail- channels ──────────────
export async function handleModMailReply(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  const ch = message.channel as TextChannel;
  if (!ch.name?.startsWith(MAIL_CHANNEL_PREFIX)) return;

  await forwardModReplyToUser(message).catch(() => {});
}

