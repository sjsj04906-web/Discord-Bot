import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { updateGuildConfig, getGuildConfig, getModMailSessionByChannel, closeModMailSession, getModMailSessionByUser } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("Configure and manage the mod mail system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Set the channel where new mod mail threads will be created")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Mod mail parent channel").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("close")
      .setDescription("Close this mod mail thread and notify the user")
      .addStringOption((o) =>
        o.setName("reason").setDescription("Closing reason (sent to user)").setRequired(false).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("reply")
      .setDescription("Reply to a user's mod mail by their ID (use inside the mail channel instead when possible)")
      .addUserOption((o) =>
        o.setName("user").setDescription("User to reply to").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("message").setDescription("Your reply").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("status")
      .setDescription("Show the current mod mail configuration")
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Disable mod mail — users can no longer open threads via DM")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (sub === "setup") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await updateGuildConfig(interaction.guild.id, { modMailChannelId: ch.id });

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setTitle("✅ // MOD MAIL CONFIGURED")
      .setDescription(`New mod mail threads will be created near ${ch}.\n\nMembers can now DM **${BOT_NAME}** to contact your mod team.`)
      .setFooter({ text: "Reply in the created channel — messages are forwarded automatically" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── Close ─────────────────────────────────────────────────────────────────
  if (sub === "close") {
    const reason  = interaction.options.getString("reason") ?? "Your mod mail has been closed by the team.";
    const session = await getModMailSessionByChannel(interaction.channelId);

    if (!session) {
      await interaction.reply({ content: "This is not a mod mail channel.", ephemeral: true });
      return;
    }

    await closeModMailSession(session.id);

    const user = await interaction.client.users.fetch(session.userId).catch(() => null);
    if (user) {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.muted)
            .setTitle(`📭 ${BOT_NAME} // MOD MAIL CLOSED`)
            .setDescription(`Your mod mail thread in **${interaction.guild.name}** has been closed.\n**Reason:** ${reason}`)
            .setTimestamp(),
        ],
      }).catch(() => {});
    }

    await interaction.reply({ content: `🔒 Closing this thread in 5 seconds...` });

    setTimeout(() => {
      (interaction.channel as TextChannel)?.delete(`Mod mail closed by ${interaction.user.tag}`).catch(() => {});
    }, 5000);
    return;
  }

  // ── Reply ─────────────────────────────────────────────────────────────────
  if (sub === "reply") {
    const target = interaction.options.getUser("user", true);
    const text   = interaction.options.getString("message", true);

    const session = await getModMailSessionByUser(interaction.guild.id, target.id);
    if (!session || session.status === "closed") {
      await interaction.reply({ content: `No open mod mail thread found for ${target.tag}.`, ephemeral: true });
      return;
    }

    const replyEmbed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `${BOT_NAME} // Mod Team`, iconURL: interaction.guild.iconURL() ?? undefined })
      .setDescription(text)
      .setTimestamp();

    const sent = await target.send({ embeds: [replyEmbed] }).catch(() => null);

    if (!sent) {
      await interaction.reply({ content: `❌ Could not DM ${target.tag} — their DMs may be closed.`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: `✅ Reply sent to ${target.tag}.`, ephemeral: true });
    return;
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const ch = config.modMailChannelId ? `<#${config.modMailChannelId}>` : "Not configured";

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setTitle("📬 // MOD MAIL STATUS")
      .addFields(
        { name: "CHANNEL", value: ch },
        { name: "STATUS",  value: config.modMailChannelId ? "✅ Active — members can DM the bot" : "❌ Inactive" },
      )
      .setFooter({ text: BOT_NAME })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── Disable ───────────────────────────────────────────────────────────────
  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { modMailChannelId: "" });
    await interaction.reply({ content: "✅ Mod mail disabled. Members can no longer open threads via DM.", ephemeral: true });
  }
}
