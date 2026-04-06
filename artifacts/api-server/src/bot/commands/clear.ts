import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { log } from "../display.js";
import { THEME, BOT_NAME } from "../theme.js";

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Bulk delete messages from one or more channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Messages to delete per channel (1–100)").setMinValue(1).setMaxValue(100).setRequired(true)
  )
  .addChannelOption((o) =>
    o.setName("channel1").setDescription("First channel to purge (defaults to current channel)").setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName("channel2").setDescription("Second channel to purge").setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName("channel3").setDescription("Third channel to purge").setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName("channel4").setDescription("Fourth channel to purge").setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName("channel5").setDescription("Fifth channel to purge").setRequired(false)
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Only delete messages from this user").setRequired(false)
  );

async function purgeChannel(channel: TextChannel, amount: number, filterUserId?: string): Promise<{ deleted: number; skipped: number }> {
  let messages = await channel.messages.fetch({ limit: 100 });

  if (filterUserId) {
    messages = messages.filter((m) => m.author.id === filterUserId);
  }

  const toDelete = [...messages.values()]
    .filter((m) => m.createdTimestamp > Date.now() - TWO_WEEKS)
    .slice(0, amount);

  const skipped = messages.size - toDelete.length;

  if (toDelete.length === 0) return { deleted: 0, skipped };

  const result = await channel.bulkDelete(toDelete, true);
  return { deleted: result.size, skipped };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const amount     = interaction.options.getInteger("amount", true);
  const filterUser = interaction.options.getUser("user");

  // Collect unique channels; fall back to current channel if none specified
  const channelKeys = ["channel1", "channel2", "channel3", "channel4", "channel5"] as const;
  const picked = channelKeys
    .map((k) => interaction.options.getChannel(k) as TextChannel | null)
    .filter((c): c is TextChannel => !!c && c.isTextBased());

  const targets: TextChannel[] = picked.length > 0
    ? [...new Map(picked.map((c) => [c.id, c])).values()]
    : [interaction.channel as TextChannel];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const results: Array<{ channel: TextChannel; deleted: number; skipped: number; error?: string }> = [];

  for (const ch of targets) {
    try {
      const { deleted, skipped } = await purgeChannel(ch, amount, filterUser?.id);
      results.push({ channel: ch, deleted, skipped });
      log.clear(ch.name, interaction.guild.name, deleted);
    } catch (err) {
      results.push({ channel: ch, deleted: 0, skipped: 0, error: String(err) });
    }
  }

  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);

  const embed = new EmbedBuilder()
    .setColor(THEME.clear)
    .setAuthor({ name: `🗑️  Transmissions Purged  ·  ${BOT_NAME}` })
    .setTitle(`${totalDeleted} message${totalDeleted !== 1 ? "s" : ""} deleted across ${targets.length} channel${targets.length !== 1 ? "s" : ""}`)
    .addFields(
      results.map((r) => ({
        name:   `#${r.channel.name}`,
        value:  r.error
          ? `❌ Error: ${r.error}`
          : r.deleted === 0
            ? "Nothing to delete (all messages older than 14 days)"
            : `🗑️ ${r.deleted} deleted${r.skipped > 0 ? `  ·  ${r.skipped} too old` : ""}`,
        inline: true,
      }))
    )
    .setFooter({
      text: filterUser
        ? `Filtered to: ${filterUser.tag}`
        : "No user filter applied",
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
