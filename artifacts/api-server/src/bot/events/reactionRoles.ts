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
  console.log(`[RR:add] user.bot=${user.bot} emoji=${reaction.emoji.name}`);
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch (e) { console.log(`[RR:add] reaction fetch failed`, e); return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch (e) { console.log(`[RR:add] message fetch failed`, e); return; }
  }

  console.log(`[RR:add] guild=${reaction.message.guild?.id} msgId=${reaction.message.id}`);
  if (!reaction.message.guild) return;

  const emoji = normalizeEmoji(reaction);
  console.log(`[RR:add] looking up emoji="${emoji}" in guild=${reaction.message.guild.id} msg=${reaction.message.id}`);
  const rr    = await getReactionRole(reaction.message.guild.id, reaction.message.id, emoji);
  console.log(`[RR:add] rr=`, JSON.stringify(rr));
  if (!rr) return;

  const member = reaction.message.guild.members.cache.get(user.id)
    ?? await reaction.message.guild.members.fetch(user.id).catch(() => null);
  console.log(`[RR:add] member=${member?.id}`);
  if (!member) return;

  await member.roles.add(rr.roleId, "Reaction role assigned").catch((e) => console.log(`[RR:add] roles.add failed`, e));
  console.log(`[RR:add] done — added role ${rr.roleId} to ${member.id}`);
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
