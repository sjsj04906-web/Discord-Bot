import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { sendModLog } from "../modlog.js";
import { THEME } from "../theme.js";

export const data = new SlashCommandBuilder()
  .setName("bulkban")
  .setDescription("Ban multiple users at once by pasting their IDs (space or comma separated)")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption((o) =>
    o.setName("ids").setDescription("User IDs to ban, separated by spaces or commas").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason applied to all bans").setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName("delete_days").setDescription("Days of message history to delete (0–7, default 0)").setMinValue(0).setMaxValue(7).setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const raw        = interaction.options.getString("ids", true);
  const reason     = interaction.options.getString("reason") ?? "Bulk ban";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;

  const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s));

  if (ids.length === 0) {
    await interaction.editReply("No valid user IDs found. IDs must be 17–20 digit numbers.");
    return;
  }
  if (ids.length > 50) {
    await interaction.editReply("Maximum 50 IDs per bulk ban.");
    return;
  }

  const results: { id: string; ok: boolean; tag?: string }[] = [];

  for (const id of ids) {
    try {
      let tag = id;
      try {
        const user = await interaction.client.users.fetch(id);
        tag = user.tag;
      } catch { /* use id as tag */ }

      await interaction.guild.members.ban(id, {
        reason: `[Bulk Ban] ${reason} — by ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
      results.push({ id, ok: true, tag });
    } catch {
      results.push({ id, ok: false });
    }
  }

  const succeeded = results.filter((r) => r.ok);
  const failed    = results.filter((r) => !r.ok);

  const embed = new EmbedBuilder()
    .setColor(succeeded.length > 0 ? THEME.danger : THEME.warn)
    .setTitle("🔨 // BULK BAN COMPLETE")
    .addFields(
      { name: "REQUESTED",  value: String(ids.length), inline: true },
      { name: "✅ BANNED",  value: String(succeeded.length), inline: true },
      { name: "❌ FAILED",  value: String(failed.length), inline: true },
      { name: "REASON",     value: reason },
    )
    .setFooter({ text: `Operator: ${interaction.user.tag}` })
    .setTimestamp();

  if (succeeded.length > 0) {
    embed.addFields({
      name: "BANNED USERS",
      value: succeeded.map((r) => `\`${r.tag ?? r.id}\``).join(", ").slice(0, 1000),
    });
  }
  if (failed.length > 0) {
    embed.addFields({
      name: "FAILED IDs",
      value: failed.map((r) => `\`${r.id}\``).join(", ").slice(0, 500),
    });
  }

  await interaction.editReply({ embeds: [embed] });

  if (succeeded.length > 0) {
    const fakeTarget = { id: "bulk", tag: `${succeeded.length} users`, displayAvatarURL: () => "" } as never;
    await sendModLog(interaction.guild, {
      action: `🔨 BULK BAN // ${succeeded.length} USERS`,
      color: THEME.danger,
      target: fakeTarget,
      moderator: interaction.user,
      reason,
      extra: {
        "BANNED": succeeded.map((r) => r.tag ?? r.id).join(", ").slice(0, 900),
        "DELETE HISTORY": `${deleteDays} day(s)`,
      },
      skipCase: true,
    });
  }
}
