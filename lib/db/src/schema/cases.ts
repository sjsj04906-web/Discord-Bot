import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const casesTable = pgTable("cases", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  actionType:   text("action_type").notNull(),
  targetId:     text("target_id").notNull(),
  targetTag:    text("target_tag").notNull(),
  moderatorId:  text("moderator_id").notNull(),
  moderatorTag: text("moderator_tag").notNull(),
  reason:       text("reason").notNull(),
  extra:        text("extra").default("").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type Case = typeof casesTable.$inferSelect;
