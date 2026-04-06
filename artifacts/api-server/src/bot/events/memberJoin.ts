import { type GuildMember, EmbedBuilder, type TextChannel } from "discord.js";
import { getGuildConfig } from "../db.js";
import { THEME } from "../theme.js";

const MOD_CHANNEL_NAMES = ["mod-log", "modlog", "mod-logs", "modlogs"];

const DEHOIST_PATTERN = /^[^a-zA-Z0-9]/;
const DEHOIST_PREFIX = "zzz";

export async function handleNewAccount(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (config.newAccountDays === 0) return;

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (accountAgeDays >= config.newAccountDays) return;

  const channel = member.guild.channels.cache.find(
    (c) => MOD_CHANNEL_NAMES.includes(c.name.toLowerCase()) && c.isTextBased()
  ) as TextChannel | undefined;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(THEME.warn)
    .setTitle("🆕 // SUSPICIOUS NEW ACCOUNT")
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`${member} joined with a **${Math.floor(accountAgeDays * 24)} hour old** account.`)
    .addFields(
      { name: "USER",         value: `${member.user} \`${member.user.tag}\``, inline: true },
      { name: "ACCOUNT AGE",  value: `${Math.floor(accountAgeDays * 24)}h`, inline: true },
      { name: "THRESHOLD",    value: `${config.newAccountDays} days`, inline: true },
    )
    .setFooter({ text: `User ID: ${member.user.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleDehoist(member: GuildMember): Promise<void> {
  const displayName = member.nickname ?? member.user.username;
  if (!DEHOIST_PATTERN.test(displayName)) return;

  const newNick = `${DEHOIST_PREFIX} ${member.user.username}`.slice(0, 32);
  try {
    await member.setNickname(newNick, "Auto-dehoist: username started with a special character");
  } catch { /* no perms */ }
}
