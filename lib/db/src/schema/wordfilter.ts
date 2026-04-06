import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wordFilterTable = pgTable("word_filter", {
  id:        serial("id").primaryKey(),
  guildId:   text("guild_id").notNull(),
  word:      text("word").notNull(),
  addedBy:   text("added_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWordFilterSchema = createInsertSchema(wordFilterTable).omit({ id: true, createdAt: true });
export type InsertWordFilter = z.infer<typeof insertWordFilterSchema>;
export type WordFilter = typeof wordFilterTable.$inferSelect;
