import { pgTable, serial, text, unique } from "drizzle-orm/pg-core";

export const autoRespondersTable = pgTable("auto_responders", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  trigger:   text("trigger").notNull(),
  response:  text("response").notNull(),
  matchType: text("match_type").notNull().default("contains"),
}, (t) => ({ uniq: unique().on(t.guildId, t.trigger) }));

export type AutoResponder = typeof autoRespondersTable.$inferSelect;
