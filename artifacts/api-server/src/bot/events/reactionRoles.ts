import {
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";
import { getReactionRole } from "../db.js";

function normalizeEmoji(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? "");
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  if (!reaction.message.guild) return;

  const emoji   = normalizeEmoji(reaction);
  const rr      = await getReactionRole(reaction.message.guild.id, reaction.message.id, emoji);
  if (!rr) return;

  const member = reaction.message.guild.members.cache.get(user.id)
    ?? await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await member.roles.add(rr.roleId, "Reaction role assigned").catch(() => {});
}

export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  if (!reaction.message.guild) return;

  const emoji   = normalizeEmoji(reaction);
  const rr      = await getReactionRole(reaction.message.guild.id, reaction.message.id, emoji);
  if (!rr) return;

  const member = reaction.message.guild.members.cache.get(user.id)
    ?? await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await member.roles.remove(rr.roleId, "Reaction role removed").catch(() => {});
}
