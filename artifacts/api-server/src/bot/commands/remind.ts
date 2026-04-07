import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { addReminder, getUserReminders, deleteReminder } from "../db.js";

function parseDuration(s: string): number | null {
  const map: Record<string, number> = {
    s: 1000, sec: 1000, second: 1000, seconds: 1000,
    m: 60_000, min: 60_000, minute: 60_000, minutes: 60_000,
    h: 3_600_000, hr: 3_600_000, hour: 3_600_000, hours: 3_600_000,
    d: 86_400_000, day: 86_400_000, days: 86_400_000,
    w: 604_800_000, week: 604_800_000, weeks: 604_800_000,
  };
  const match = s.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/i);
  if (!match) return null;
  const num  = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const ms   = map[unit];
  if (!ms || isNaN(num) || num <= 0) return null;
  return Math.round(num * ms);
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set and manage reminders")
  .addSubcommand((sub) =>
    sub.setName("set")
      .setDescription("Set a reminder")
      .addStringOption((o) => o.setName("in").setDescription("When to remind you (e.g. 10m, 2h, 1d)").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("message").setDescription("What to remind you about").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("list")
      .setDescription("List your pending reminders")
  )
  .addSubcommand((sub) =>
    sub.setName("cancel")
      .setDescription("Cancel a reminder by ID")
      .addIntegerOption((o) => o.setName("id").setDescription("Reminder ID (from /remind list)").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const inStr  = interaction.options.getString("in", true);
    const msg    = interaction.options.getString("message", true);
    const ms     = parseDuration(inStr);

    if (!ms) {
      await interaction.reply({ content: "Couldn't parse that duration. Try `10m`, `2h`, `1d`, `1w`.", ephemeral: true });
      return;
    }
    if (ms < 30_000) {
      await interaction.reply({ content: "Minimum reminder time is 30 seconds.", ephemeral: true });
      return;
    }
    if (ms > 604_800_000 * 4) {
      await interaction.reply({ content: "Maximum reminder time is 4 weeks.", ephemeral: true });
      return;
    }

    const remindAt = new Date(Date.now() + ms);
    const id = await addReminder({
      userId:    interaction.user.id,
      channelId: interaction.channelId,
      guildId:   interaction.guildId ?? "",
      reminder:  msg,
      remindAt,
    });

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `⏰  Reminder Set  ·  ${BOT_NAME}` })
      .setDescription(`I'll remind you in **${formatMs(ms)}**: *${msg.slice(0, 200)}*`)
      .addFields({ name: "Reminder ID", value: `\`${id}\`` })
      .setTimestamp(remindAt);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "list") {
    const reminders = await getUserReminders(interaction.user.id);
    if (reminders.length === 0) {
      await interaction.reply({ content: "You have no pending reminders.", ephemeral: true });
      return;
    }

    const lines = reminders.slice(0, 15).map((r) => {
      const when = `<t:${Math.floor(r.remindAt.getTime() / 1000)}:R>`;
      return `**\`#${r.id}\`** ${when} — ${r.reminder.slice(0, 80)}`;
    });

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `⏰  Your Reminders  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n"))
      .setFooter({ text: `${reminders.length} pending — use /remind cancel id:<ID> to remove one` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "cancel") {
    const id      = interaction.options.getInteger("id", true);
    const deleted = await deleteReminder(id, interaction.user.id);

    if (!deleted) {
      await interaction.reply({ content: `No reminder **#${id}** found under your account.`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: `✅ Reminder **#${id}** cancelled.`, ephemeral: true });
  }
}
