import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const warningsTable = pgTable("warnings", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  userId:       text("user_id").notNull(),
  reason:       text("reason").notNull(),
  moderatorTag: text("moderator_tag").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export const insertWarningSchema = createInsertSchema(warningsTable).omit({ id: true, createdAt: true });
export type InsertWarning = z.infer<typeof insertWarningSchema>;
export type Warning = typeof warningsTable.$inferSelect;
