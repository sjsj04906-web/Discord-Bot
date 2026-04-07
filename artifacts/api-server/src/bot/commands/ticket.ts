import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
  type CategoryChannel,
} from "discord.js";
import { openTicket, closeTicket, getTicketByChannel } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

const TICKET_CATEGORY = "Tickets";
const MOD_ROLES_HINT  = ["mod", "moderator", "staff", "admin"];

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Moderation ticket system")
  .addSubcommand((sub) =>
    sub.setName("open")
      .setDescription("Open a private support/mod ticket")
      .addStringOption((o) =>
        o.setName("subject").setDescription("Brief subject of your ticket").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("close")
      .setDescription("Close this ticket channel")
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason for closing").setRequired(false).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("add")
      .setDescription("Add a user to this ticket")
      .addUserOption((o) =>
        o.setName("user").setDescription("User to add").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("remove")
      .setDescription("Remove a user from this ticket")
      .addUserOption((o) =>
        o.setName("user").setDescription("User to remove").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── Open ─────────────────────────────────────────────────────────────────
  if (sub === "open") {
    const subject  = interaction.options.getString("subject") ?? "No subject";
    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "ticket";
    const chanName = `ticket-${safeName}`;

    const existing = interaction.guild.channels.cache.find((c) => c.name === chanName);
    if (existing) {
      await interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
      return;
    }

    const category = interaction.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === TICKET_CATEGORY.toLowerCase()
    ) as CategoryChannel | undefined;

    const modRoles = interaction.guild.roles.cache.filter((r) =>
      MOD_ROLES_HINT.some((hint) => r.name.toLowerCase().includes(hint))
    );

    const permOverwrites = [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ...modRoles.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
    ];

    const channel = await interaction.guild.channels.create({
      name: chanName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: permOverwrites,
      topic: `Ticket by ${interaction.user.tag} — ${subject}`,
    }) as TextChannel;

    await openTicket(interaction.guild.id, channel.id, interaction.user.id, interaction.user.tag, subject);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle(`🎫 // TICKET OPENED`)
      .setDescription(`Hello ${interaction.user}, the moderation team will be with you shortly.\n\n**Subject:** ${subject}`)
      .addFields({ name: "CLOSE TICKET", value: "Use `/ticket close` when your issue is resolved." })
      .setFooter({ text: BOT_NAME })
      .setTimestamp();

    await channel.send({ content: `${interaction.user} ${modRoles.map((r) => r.toString()).join(" ")}`, embeds: [embed] });
    await interaction.reply({ content: `✅ Your ticket has been created: ${channel}`, ephemeral: true });
    return;
  }

  // ── Close ────────────────────────────────────────────────────────────────
  if (sub === "close") {
    const reason  = interaction.options.getString("reason") ?? "No reason provided";
    const ticket  = await getTicketByChannel(interaction.channelId);

    const isStaff = (interaction.guild.members.cache.get(interaction.user.id)
      ?.permissions.has(PermissionFlagsBits.ModerateMembers)) ?? false;

    if (!ticket && !isStaff) {
      await interaction.reply({ content: "This is not a ticket channel.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: `🔒 Closing ticket in 5 seconds... (${reason})` });

    // Notify the ticket opener via DM
    if (ticket) {
      await closeTicket(ticket.id);
      const opener = await interaction.client.users.fetch(ticket.userId).catch(() => null);
      if (opener) {
        await opener.send(
          `🎫 Your ticket in **${interaction.guild.name}** has been closed.\n**Reason:** ${reason}`
        ).catch(() => {});
      }
    }

    setTimeout(() => {
      (interaction.channel as TextChannel)?.delete(`Ticket closed by ${interaction.user.tag}: ${reason}`).catch(() => {});
    }, 5000);
    return;
  }

  // ── Add ──────────────────────────────────────────────────────────────────
  if (sub === "add") {
    const target = interaction.options.getUser("user", true);
    const ch = interaction.channel as TextChannel;
    await ch.permissionOverwrites.edit(target.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    await interaction.reply({ content: `✅ Added ${target} to this ticket.` });
    return;
  }

  // ── Remove ───────────────────────────────────────────────────────────────
  if (sub === "remove") {
    const target = interaction.options.getUser("user", true);
    const ch = interaction.channel as TextChannel;
    await ch.permissionOverwrites.edit(target.id, { ViewChannel: false });
    await interaction.reply({ content: `✅ Removed ${target} from this ticket.` });
  }
}
