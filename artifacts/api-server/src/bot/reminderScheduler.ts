import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getPendingReminders, markReminderSent } from "./db.js";
import { THEME, BOT_NAME } from "./theme.js";
import { logger } from "../lib/logger.js";

async function processDueReminders(client: Client): Promise<void> {
  const due = await getPendingReminders().catch(() => []);
  for (const r of due) {
    try {
      const channel = await client.channels.fetch(r.channelId).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(THEME.info)
        .setAuthor({ name: `⏰  Reminder  ·  ${BOT_NAME}` })
        .setDescription(`<@${r.userId}> — ${r.reminder}`)
        .setFooter({ text: `Reminder #${r.id}` })
        .setTimestamp();

      if (channel?.isTextBased()) {
        await (channel as import("discord.js").TextChannel).send({ embeds: [embed] }).catch(() => {});
      } else {
        // fallback: DM the user
        const user = await client.users.fetch(r.userId).catch(() => null);
        if (user) await user.send({ embeds: [embed] }).catch(() => {});
      }

      await markReminderSent(r.id);
    } catch (err) {
      logger.error({ err, reminderId: r.id }, "Failed to send reminder");
    }
  }
}

export function startReminderScheduler(client: Client): void {
  setInterval(() => processDueReminders(client), 30_000);
  logger.info("Reminder scheduler started (30s interval)");
}
