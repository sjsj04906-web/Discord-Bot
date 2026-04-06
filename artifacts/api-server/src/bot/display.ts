import chalk, { type ChalkInstance } from "chalk";

const BOT_NAME = "GUARDIAN";

const c = {
  brand:   chalk.hex("#5865F2"),
  success: chalk.hex("#57F287"),
  warn:    chalk.hex("#FEE75C"),
  danger:  chalk.hex("#ED4245"),
  mute:    chalk.hex("#EB459E"),
  info:    chalk.hex("#00B0F4"),
  dim:     chalk.gray,
  bold:    chalk.bold,
  white:   chalk.white,
};

function ts(): string {
  return c.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));
}

export function printBanner(tag: string, guilds: number, members: number, commandCount: number): void {
  const line = "═".repeat(58);
  const inner = `${BOT_NAME}  •  Discord Moderator Bot`;
  const pad = Math.floor((58 - inner.length) / 2);

  process.stdout.write("\n");
  process.stdout.write(c.brand(`╔${line}╗\n`));
  process.stdout.write(c.brand(`║${" ".repeat(pad)}`) + c.bold.white(inner) + c.brand(`${" ".repeat(58 - pad - inner.length)}║\n`));
  process.stdout.write(c.brand(`╚${line}╝\n`));
  process.stdout.write("\n");

  process.stdout.write(`  ${c.brand("✦")}  ${c.white("Logged in as")} ${c.bold(tag)}\n`);
  process.stdout.write(`  ${c.brand("✦")}  ${c.white("Serving")} ${c.bold(String(guilds))} ${guilds === 1 ? "guild" : "guilds"}  ${c.dim("•")}  ${c.bold(String(members))} members\n`);
  process.stdout.write(`  ${c.brand("✦")}  ${c.bold(String(commandCount))} ${c.white("slash commands registered")}\n`);
  process.stdout.write(`  ${c.brand("✦")}  ${c.white("Auto-mod:")} ${c.success.bold("ACTIVE")}\n`);
  process.stdout.write("\n");
  process.stdout.write(c.dim("─".repeat(60) + "\n"));
}

function row(icon: string, label: string, color: ChalkInstance, detail: string): void {
  const paddedLabel = label.padEnd(10);
  process.stdout.write(`  ${ts()}  ${icon}  ${color.bold(paddedLabel)}${c.dim("│")}  ${c.white(detail)}\n`);
}

export const log = {
  ban(user: string, guild: string, reason: string): void {
    row("🔨", "BAN", c.danger, `${c.bold(user)} in ${c.dim(guild)} — ${reason}`);
  },
  unban(user: string, guild: string): void {
    row("🔓", "UNBAN", c.success, `${c.bold(user)} in ${c.dim(guild)}`);
  },
  kick(user: string, guild: string, reason: string): void {
    row("👟", "KICK", c.warn, `${c.bold(user)} in ${c.dim(guild)} — ${reason}`);
  },
  mute(user: string, guild: string, duration: string, reason: string): void {
    row("🔇", "MUTE", c.mute, `${c.bold(user)} in ${c.dim(guild)} for ${duration} — ${reason}`);
  },
  unmute(user: string, guild: string): void {
    row("🔊", "UNMUTE", c.success, `${c.bold(user)} in ${c.dim(guild)}`);
  },
  warn(user: string, guild: string, count: number, reason: string): void {
    row("⚠ ", "WARN", c.warn, `${c.bold(user)} in ${c.dim(guild)} [#${count}] — ${reason}`);
  },
  clear(channel: string, guild: string, count: number): void {
    row("🧹", "CLEAR", c.info, `${count} messages in ${c.bold(channel)} (${c.dim(guild)})`);
  },
  lock(channel: string, guild: string): void {
    row("🔒", "LOCK", c.danger, `${c.bold(channel)} in ${c.dim(guild)}`);
  },
  unlock(channel: string, guild: string): void {
    row("🔓", "UNLOCK", c.success, `${c.bold(channel)} in ${c.dim(guild)}`);
  },
  slowmode(channel: string, guild: string, seconds: number): void {
    row("🐢", "SLOWMODE", c.info, `${c.bold(channel)} in ${c.dim(guild)} set to ${seconds}s`);
  },
  automod(rule: string, user: string, guild: string, preview: string): void {
    row("🛡 ", "AUTOMOD", c.brand, `${c.bold(rule)} → ${c.bold(user)} in ${c.dim(guild)}  ${c.dim(`"${preview.slice(0, 40)}${preview.length > 40 ? "…" : ""}"`)} `);
  },
  escalate(user: string, guild: string, action: string, warns: number): void {
    row("📈", "ESCALATE", c.danger, `${c.bold(user)} in ${c.dim(guild)} → ${action} after ${warns} warns`);
  },
  join(user: string, guild: string): void {
    row("👋", "JOIN", c.success, `${c.bold(user)} joined ${c.dim(guild)}`);
  },
  command(name: string, user: string, guild: string): void {
    row("⌘ ", `/${name}`, c.dim, `by ${c.bold(user)} in ${c.dim(guild)}`);
  },
  error(msg: string): void {
    row("✖ ", "ERROR", c.danger, c.danger(msg));
  },
};
