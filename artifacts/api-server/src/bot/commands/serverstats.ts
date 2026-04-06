import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type VoiceChannel,
  type Client,
  MessageFlags,
} from "discord.js";
import { updateGuildConfig, getGuildConfig } from "../db.js";
import { THEME, BOT_NAME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("serverstats")
  .setDescription("Auto-updating voice channels that display server member counts")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Create stat channels in a new category (updates every 10 min)")
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Stop updating stats channels and clear config")
  )
  .addSubcommand((sub) =>
    sub.setName("status")
      .setDescription("Show current stats channel configuration")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const everyone  = interaction.guild.roles.everyone;
    const botId     = interaction.client.user!.id;

    const category = await interaction.guild.channels.create({
      name: "📊 Server Stats",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: botId, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
      ],
    });

    const memberCount = interaction.guild.memberCount;
    const humanCount  = interaction.guild.members.cache.filter((m) => !m.user.bot).size;
    const botCount    = interaction.guild.members.cache.filter((m) => m.user.bot).size;

    const memberCh = await interaction.guild.channels.create({
      name: `👥 Members: ${memberCount}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: botId, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
      ],
    }) as VoiceChannel;

    const humanCh = await interaction.guild.channels.create({
      name: `🙂 Humans: ${humanCount}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: botId, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
      ],
    }) as VoiceChannel;

    await interaction.guild.channels.create({
      name: `🤖 Bots: ${botCount}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: botId, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
      ],
    });

    await updateGuildConfig(interaction.guild.id, {
      memberCountChannelId: memberCh.id,
      humanCountChannelId:  humanCh.id,
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `📊  Server Stats  ·  ${BOT_NAME}` })
          .setDescription("Stat channels created and will update every 10 minutes.")
          .addFields(
            { name: "Members", value: `<#${memberCh.id}>`, inline: true },
            { name: "Humans",  value: `<#${humanCh.id}>`,  inline: true },
          ),
      ],
    });
    return;
  }

  if (sub === "disable") {
    await updateGuildConfig(interaction.guild.id, { memberCountChannelId: "", humanCountChannelId: "" });
    await interaction.reply({ content: "Stats channels disabled.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "status") {
    const config = await getGuildConfig(interaction.guild.id);
    const members = config.memberCountChannelId ? `<#${config.memberCountChannelId}>` : "Not set";
    const humans  = config.humanCountChannelId  ? `<#${config.humanCountChannelId}>` : "Not set";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.info)
          .setTitle("📊 Server Stats Status")
          .addFields(
            { name: "Members Channel", value: members, inline: true },
            { name: "Humans Channel",  value: humans,  inline: true },
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ── Scheduler called from bot ready ───────────────────────────────────────────
export function startServerStatsScheduler(client: Client): void {
  const update = async () => {
    for (const guild of client.guilds.cache.values()) {
      const config = await getGuildConfig(guild.id).catch(() => null);
      if (!config?.memberCountChannelId && !config?.humanCountChannelId) continue;

      await guild.members.fetch().catch(() => {});

      const memberCount = guild.memberCount;
      const humanCount  = guild.members.cache.filter((m) => !m.user.bot).size;
      const botCount    = guild.members.cache.filter((m) => m.user.bot).size;

      if (config.memberCountChannelId) {
        const ch = guild.channels.cache.get(config.memberCountChannelId) as VoiceChannel | undefined;
        await ch?.setName(`👥 Members: ${memberCount}`).catch(() => {});
      }

      if (config.humanCountChannelId) {
        const ch = guild.channels.cache.get(config.humanCountChannelId) as VoiceChannel | undefined;
        await ch?.setName(`🙂 Humans: ${humanCount}  🤖 Bots: ${botCount}`).catch(() => {});
      }
    }
  };

  // Update immediately then every 10 minutes
  setTimeout(update, 5_000);
  setInterval(update, 10 * 60 * 1000);
}
