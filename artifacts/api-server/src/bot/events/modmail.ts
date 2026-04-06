import {
  type Message,
  type PartialMessage,
  type ButtonInteraction,
  type User,
  type TextChannel,
  type Guild,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
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
const TRIGGERS = ["!mail", "!modmail", "!contact", "!help", "!report"];
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory: userId → { guildId, timestamp }
const pendingChoices = new Map<string, { guildId: string; timestamp: number }>();

function cleanPending() {
  const now = Date.now();
  for (const [id, data] of pendingChoices) {
    if (now - data.timestamp > PENDING_TTL_MS) pendingChoices.delete(id);
  }
}

// ── Build permission overwrites for a mail channel ────────────────────────────
function buildOverwrites(
  guild: Guild,
  botId: string,
): Parameters<Guild["channels"]["create"]>[0]["permissionOverwrites"] {
  const modRoles = guild.roles.cache.filter((r) =>
    ["mod", "moderator", "staff", "admin"].some((h) => r.name.toLowerCase().includes(h))
  );

  const overwrites: Parameters<Guild["channels"]["create"]>[0]["permissionOverwrites"] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const rolesToAllow = modRoles.size > 0
    ? modRoles
    : guild.roles.cache.filter((r) => r.permissions.has(PermissionFlagsBits.Administrator));

  for (const role of rolesToAllow.values()) {
    overwrites.push({
      id: role.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  return overwrites;
}

// ── Open a new mail channel thread ────────────────────────────────────────────
async function openModMailThread(user: User, guild: Guild, anonymous: boolean): Promise<void> {
  const config = await getGuildConfig(guild.id);
  if (!config.modMailChannelId) return;

  const modChannel = await guild.channels.fetch(config.modMailChannelId).catch(() => null) as TextChannel | null;
  if (!modChannel) return;

  const overwrites  = buildOverwrites(guild, guild.client.user!.id);
  const caseId      = Math.random().toString(36).slice(2, 8).toUpperCase();
  const chanName    = anonymous
    ? `${MAIL_CHANNEL_PREFIX}${caseId.toLowerCase()}`
    : `${MAIL_CHANNEL_PREFIX}${user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user"}`;

  const mailChannel = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: modChannel.parentId ?? undefined,
    permissionOverwrites: overwrites,
    topic: anonymous
      ? `Anonymous mod mail — case ${caseId}`
      : `Mod mail from ${user.tag} (${user.id}) — case ${caseId}`,
  }) as TextChannel;

  await openModMailSession(guild.id, user.id, user.tag, mailChannel.id);

  // Opening embed for mods
  const openEmbed = new EmbedBuilder()
    .setColor(THEME.info)
    .setAuthor({ name: `📬  Mod Mail Opened  ·  ${BOT_NAME}` })
    .setTimestamp();

  if (anonymous) {
    openEmbed
      .setTitle(`Anonymous Thread — Case ${caseId}`)
      .setDescription("An anonymous member has opened a mod mail thread.\n\nReply by typing in this channel — every message is forwarded to them automatically.\nUse `/modmail close` to resolve and delete this thread.");
  } else {
    openEmbed
      .setTitle(user.tag)
      .setURL(`https://discord.com/users/${user.id}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`**${user.tag}** has opened a mod mail thread.\n\nReply by typing in this channel — every message is forwarded to them automatically.\nUse \`/modmail close\` to resolve and delete this thread.`)
      .addFields(
        { name: "User",        value: `${user}`, inline: true },
        { name: "Account Age", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Case",        value: caseId, inline: true },
      );
  }

  await mailChannel.send({ embeds: [openEmbed] });

  // Confirm to the user
  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.success)
        .setAuthor({ name: `📬  Mod Mail  ·  ${BOT_NAME}` })
        .setTitle("Thread opened")
        .setDescription(
          anonymous
            ? `Your anonymous thread with the mod team of **${guild.name}** is open.\n\nSend your message here and it will be forwarded. They will reply in this DM.`
            : `Your thread with the mod team of **${guild.name}** is open.\n\nSend your message here and it will be forwarded. They will reply in this DM.`
        )
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ── Send the trigger prompt with Anonymous / Named buttons ────────────────────
async function sendChoicePrompt(user: User, guildId: string): Promise<void> {
  cleanPending();
  pendingChoices.set(user.id, { guildId, timestamp: Date.now() });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("modmail_anon")
      .setLabel("🔒  Anonymous")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("modmail_open")
      .setLabel("👤  Include my name")
      .setStyle(ButtonStyle.Primary),
  );

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.info)
        .setAuthor({ name: `📬  Mod Mail  ·  ${BOT_NAME}` })
        .setTitle("Open a mod mail thread")
        .setDescription("Choose how you'd like to contact the mod team:")
        .addFields(
          { name: "🔒  Anonymous", value: "Mods will not see your username or any identifying info." },
          { name: "👤  Include my name", value: "Mods will see your username, avatar, and Discord profile." },
        )
        .setFooter({ text: "This prompt expires in 5 minutes" })
        .setTimestamp(),
    ],
    components: [row],
  }).catch(() => {});
}

// ── Forward a DM message to the open mail channel ─────────────────────────────
async function forwardDmToMod(message: Message, guild: Guild): Promise<void> {
  const config = await getGuildConfig(guild.id);
  if (!config.modMailChannelId) return;

  let session = await getModMailSessionByUser(guild.id, message.author.id);
  if (!session) return; // no open thread — user should use !mail first

  let mailChannel = await guild.channels.fetch(session.channelId).catch(() => null) as TextChannel | null;
  if (!mailChannel) {
    // Channel was deleted — close the stale session and tell user
    await closeModMailSession(session.id);
    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warning)
          .setDescription("Your previous mod mail thread was deleted. DM `!mail` to open a new one."),
      ],
    }).catch(() => {});
    return;
  }

  // Determine how to display the author based on whether session was anonymous
  // (anonymous sessions have a random channel name, named ones have the username)
  const isAnon = !mailChannel.name.includes(
    message.author.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)
  );

  const fwdEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor(
      isAnon
        ? { name: "Anonymous User" }
        : { name: message.author.tag, iconURL: message.author.displayAvatarURL() }
    )
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

// ── Main DM handler (called from raw event in index.ts) ───────────────────────
export async function handleDirectMessage(message: Message | PartialMessage): Promise<void> {
  const msg = message.partial ? await message.fetch().catch(() => null) : message;
  if (!msg || !msg.author || msg.author.bot) return;
  if (msg.guild) return;

  const content = msg.content?.trim() ?? "";

  // Find the first guild with modmail configured
  let targetGuild: Guild | null = null;
  let targetGuildId: string | null = null;
  for (const guild of msg.client.guilds.cache.values()) {
    const config = await getGuildConfig(guild.id).catch(() => null);
    if (config?.modMailChannelId) {
      targetGuild = guild;
      targetGuildId = guild.id;
      break;
    }
  }

  // ── Trigger command: !mail / !modmail / !contact / !help ─────────────────
  if (TRIGGERS.some((t) => content.toLowerCase().startsWith(t))) {
    if (!targetGuildId) {
      await msg.author.send({
        embeds: [new EmbedBuilder().setColor(THEME.warning).setDescription("Mod mail is not currently configured on this server.")],
      }).catch(() => {});
      return;
    }

    // Already has an open thread
    const existingSession = await getModMailSessionByUser(targetGuildId, msg.author.id);
    if (existingSession) {
      await msg.author.send({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.info)
            .setDescription("You already have an open mod mail thread. Just send your message here and it will be forwarded.\n\nIf the thread was closed and you want a new one, wait a moment and try again."),
        ],
      }).catch(() => {});
      return;
    }

    await sendChoicePrompt(msg.author, targetGuildId);
    return;
  }

  // ── Regular DM — only forward if there's an open session ──────────────────
  if (!targetGuild) return;

  const session = await getModMailSessionByUser(targetGuildId!, msg.author.id);
  if (!session) {
    // No thread open — prompt them to start one
    await msg.author.send({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setAuthor({ name: `📬  Mod Mail  ·  ${BOT_NAME}` })
          .setDescription(`DM \`!mail\` to open a mod mail thread with the mod team.`),
      ],
    }).catch(() => {});
    return;
  }

  await forwardDmToMod(msg as Message, targetGuild).catch((err) => {
    console.error("[modmail] forwardDmToMod error:", err);
  });
}

// ── Button interaction handler (Anonymous / Include my name) ──────────────────
export async function handleModMailButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const userId  = interaction.user.id;
  const pending = pendingChoices.get(userId);

  if (!pending || Date.now() - pending.timestamp > PENDING_TTL_MS) {
    await interaction.reply({
      content: "This prompt has expired. DM `!mail` again to open a new thread.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  pendingChoices.delete(userId);
  const anonymous = interaction.customId === "modmail_anon";
  const guild     = interaction.client.guilds.cache.get(pending.guildId);

  if (!guild) {
    await interaction.reply({ content: "Could not find the server. Please try again.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  // Disable the buttons so they can't be clicked twice
  await interaction.update({
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("modmail_anon").setLabel("🔒  Anonymous").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("modmail_open").setLabel("👤  Include my name").setStyle(ButtonStyle.Primary).setDisabled(true),
      ),
    ],
  }).catch(() => {});

  await openModMailThread(interaction.user, guild, anonymous).catch((err) => {
    console.error("[modmail] openModMailThread error:", err);
  });
}

// ── Guild message handler: forward mod replies in mail- channels ──────────────
export async function handleModMailReply(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  const ch = message.channel as TextChannel;
  if (!ch.name?.startsWith(MAIL_CHANNEL_PREFIX)) return;

  await forwardModReplyToUser(message).catch(() => {});
}
