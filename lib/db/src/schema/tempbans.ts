import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tempBansTable = pgTable("temp_bans", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  userId:    text("user_id").notNull(),
  userTag:   text("user_tag").notNull(),
  reason:    text("reason").notNull(),
  unbanAt:   timestamp("unban_at").notNull(),
  unbanned:  boolean("unbanned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTempBanSchema = createInsertSchema(tempBansTable).omit({ id: true, unbanned: true, createdAt: true });
export type InsertTempBan = z.infer<typeof insertTempBanSchema>;
export type TempBan = typeof tempBansTable.$inferSelect;
