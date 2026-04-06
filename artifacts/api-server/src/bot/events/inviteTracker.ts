import {
  type Client,
  type Guild,
  type GuildMember,
  type Invite,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";

interface InviteEntry {
  inviterId: string;
  inviterTag: string;
  uses: number;
}

// Map<guildId, Map<code, InviteEntry>>
const inviteCache = new Map<string, Map<string, InviteEntry>>();

const LOG_CHANNEL_NAMES = ["join-log", "member-log", "mod-log", "modlog", "audit-log"];

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  return (guild.channels.cache.find(
    (c) => LOG_CHANNEL_NAMES.some((n) => c.name.toLowerCase().includes(n)) && c.isTextBased()
  ) as TextChannel | undefined) ?? null;
}

async function refreshGuildInvites(guild: Guild): Promise<Map<string, InviteEntry>> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, InviteEntry>();
    for (const inv of invites.values()) {
      map.set(inv.code, {
        inviterId:  inv.inviter?.id  ?? "unknown",
        inviterTag: inv.inviter?.tag ?? "Unknown",
        uses: inv.uses ?? 0,
      });
    }
    inviteCache.set(guild.id, map);
    return map;
  } catch {
    return new Map();
  }
}

// ── Initialise on bot ready ───────────────────────────────────────────────────
export async function initInviteTracker(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await refreshGuildInvites(guild);
  }
}

// ── Invite created ────────────────────────────────────────────────────────────
export function handleInviteCreate(invite: Invite): void {
  if (!invite.guild) return;
  const map = inviteCache.get(invite.guild.id) ?? new Map<string, InviteEntry>();
  map.set(invite.code, {
    inviterId:  invite.inviter?.id  ?? "unknown",
    inviterTag: invite.inviter?.tag ?? "Unknown",
    uses: invite.uses ?? 0,
  });
  inviteCache.set(invite.guild.id, map);
}

// ── Invite deleted ────────────────────────────────────────────────────────────
export function handleInviteDelete(invite: Invite): void {
  if (!invite.guild) return;
  inviteCache.get(invite.guild.id)?.delete(invite.code);
}

// ── Member joined — work out which invite was used ────────────────────────────
export async function handleInviteJoin(member: GuildMember): Promise<void> {
  const guild      = member.guild;
  const oldInvites = inviteCache.get(guild.id) ?? new Map<string, InviteEntry>();
  const newInvites = await refreshGuildInvites(guild);

  let usedCode    = "unknown";
  let usedInviter = "Unknown";

  for (const [code, newData] of newInvites) {
    const old = oldInvites.get(code);
    if (!old || newData.uses > old.uses) {
      usedCode    = code;
      usedInviter = newData.inviterId !== "unknown"
        ? `<@${newData.inviterId}> (${newData.inviterTag})`
        : "Unknown";
      break;
    }
  }

  // Vanity URL / one-time invite edge case
  if (usedCode === "unknown" && guild.vanityURLCode) {
    usedCode    = guild.vanityURLCode;
    usedInviter = "Vanity URL";
  }

  const channel = await getLogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.success)
    .setAuthor({ name: `🔗  Invite Used  ·  ${BOT_NAME}` })
    .setTitle(member.user.tag)
    .setURL(`https://discord.com/users/${member.id}`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "Member",  value: `${member}`, inline: true },
      { name: "Inviter", value: usedInviter,  inline: true },
      { name: "Code",    value: `\`${usedCode}\``, inline: true },
    )
    .setFooter({ text: `ID: ${member.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
