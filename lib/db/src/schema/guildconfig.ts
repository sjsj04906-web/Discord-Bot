import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigTable = pgTable("guild_config", {
  guildId:          text("guild_id").primaryKey(),
  spamThreshold:    integer("spam_threshold").default(5).notNull(),
  capsThreshold:    integer("caps_threshold").default(75).notNull(),
  maxMentions:      integer("max_mentions").default(4).notNull(),
  newAccountDays:   integer("new_account_days").default(7).notNull(),
  exemptChannels:   text("exempt_channels").default("").notNull(),
  autoEscalation:   boolean("auto_escalation").default(true).notNull(),
  messageLogEnabled:   boolean("message_log_enabled").default(true).notNull(),
  messageLogChannelId: text("message_log_channel_id").default("").notNull(),
  antiRaidEnabled:  boolean("anti_raid_enabled").default(true).notNull(),
  antiRaidThreshold: integer("anti_raid_threshold").default(10).notNull(),
  antiRaidWindowSecs: integer("anti_raid_window_secs").default(30).notNull(),
  maxEmojis:        integer("max_emojis").default(15).notNull(),
  linkFilterEnabled:  boolean("link_filter_enabled").default(false).notNull(),
  maxNewlines:        integer("max_newlines").default(8).notNull(),
  welcomeChannelId:   text("welcome_channel_id").default("").notNull(),
  welcomeMessage:     text("welcome_message").default("").notNull(),
  autoRoleIds:        text("auto_role_ids").default("").notNull(),
  warnExpiryDays:     integer("warn_expiry_days").default(0).notNull(),
  modMailChannelId:    text("mod_mail_channel_id").default("").notNull(),
  modLogChannelId:     text("mod_log_channel_id").default("").notNull(),
  adminLogChannelId:   text("admin_log_channel_id").default("").notNull(),
  adminLogEnabled:     boolean("admin_log_enabled").default(true).notNull(),
  verifyRoleId:          text("verify_role_id").default("").notNull(),
  memberCountChannelId:  text("member_count_channel_id").default("").notNull(),
  humanCountChannelId:    text("human_count_channel_id").default("").notNull(),
  dataRetentionDays:      integer("data_retention_days").default(365).notNull(),
  voiceLogChannelId:      text("voice_log_channel_id").default("").notNull(),
  joinLogChannelId:       text("join_log_channel_id").default("").notNull(),
  levelingEnabled:        boolean("leveling_enabled").default(true).notNull(),
  levelUpChannelId:       text("level_up_channel_id").default("").notNull(),
  antiNukeEnabled:        boolean("anti_nuke_enabled").default(true).notNull(),
  antiNukeThreshold:      integer("anti_nuke_threshold").default(3).notNull(),
  antiNukeWindowSecs:     integer("anti_nuke_window_secs").default(10).notNull(),
  altLogChannelId:        text("alt_log_channel_id").default("").notNull(),
  suggestionChannelId:    text("suggestion_channel_id").default("").notNull(),
  economyEnabled:         boolean("economy_enabled").default(true).notNull(),
  currencyName:           text("currency_name").default("coins").notNull(),
  currencyEmoji:          text("currency_emoji").default("🪙").notNull(),
  dailyAmount:            integer("daily_amount").default(100).notNull(),
  workCooldownMins:       integer("work_cooldown_mins").default(60).notNull(),
  tickerChannelId:        text("ticker_channel_id").default("").notNull(),
  tickerMessageId:        text("ticker_message_id").default("").notNull(),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigTable);
export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigTable.$inferSelect;
