import chalk, { type ChalkInstance } from "chalk";
import { BOT_NAME, BOT_SUBTITLE } from "./theme.js";

const c = {
  cyan:    chalk.hex("#00C4CC"),
  magenta: chalk.hex("#D4006E"),
  purple:  chalk.hex("#8800E0"),
  yellow:  chalk.hex("#F0B800"),
  green:   chalk.hex("#00C97A"),
  red:     chalk.hex("#E5003A"),
  orange:  chalk.hex("#F06000"),
  blue:    chalk.hex("#0070FF"),
  dim:     chalk.hex("#555577"),
  white:   chalk.hex("#D0D0F0"),
  bold:    chalk.bold,
};

function ts(): string {
  return c.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));
}

function loadBar(filled: number, total: number, width = 12): string {
  const n = Math.round((filled / total) * width);
  return c.cyan("█".repeat(n)) + c.dim("░".repeat(width - n));
}

export function printBanner(tag: string, guilds: number, members: number, commandCount: number): void {
  const W     = 62;
  const bar   = "─".repeat(W);
  const title = ` ${BOT_NAME}  ·  ${BOT_SUBTITLE} `;
  const pad   = Math.max(0, Math.floor((W - title.length) / 2));

  process.stdout.write("\n");
  process.stdout.write(c.cyan(`┌${bar}┐\n`));
  process.stdout.write(c.cyan("│") + " ".repeat(pad) + c.cyan.bold(BOT_NAME) + c.dim(`  ·  ${BOT_SUBTITLE}`) + " ".repeat(Math.max(0, W - pad - title.length)) + c.cyan("│\n"));
  process.stdout.write(c.cyan(`├${bar}┤\n`));
  process.stdout.write(c.cyan("│") + "\n" + c.cyan("│"));

  const lines = [
    `  ${c.dim("Online as")}    ${c.cyan.bold(tag)}`,
    `  ${c.dim("Networks")}     ${c.cyan.bold(String(guilds))} guild${guilds === 1 ? "" : "s"}  ·  ${c.cyan.bold(String(members))} member${members === 1 ? "" : "s"}`,
    `  ${c.dim("Commands")}     ${c.cyan.bold(String(commandCount))} loaded`,
    `  ${c.dim("Automod")}      [${loadBar(10, 10)}]  ${c.green.bold("Active")}`,
  ];

  for (const line of lines) {
    process.stdout.write(`\n${c.cyan("│")}  ${line}`);
  }

  process.stdout.write("\n");
  process.stdout.write(c.cyan(`│\n└${bar}┘\n`));
  process.stdout.write("\n");
}

function row(icon: string, label: string, color: ChalkInstance, detail: string): void {
  const paddedLabel = label.padEnd(12);
  process.stdout.write(
    `  ${ts()}  ${icon}  ${color.bold(paddedLabel)}  ${c.dim("·")}  ${c.white(detail)}\n`
  );
}

export const log = {
  ban(user: string, guild: string, reason: string): void {
    row("⛔", "Ban", c.red, `${c.cyan.bold(user)}  ${c.dim("in")}  ${c.dim(guild)}  ${c.dim("·")}  ${reason}`);
  },
  unban(user: string, guild: string): void {
    row("✅", "Unban", c.green, `${c.cyan.bold(user)}  ${c.dim("in")}  ${c.dim(guild)}`);
  },
  kick(user: string, guild: string, reason: string): void {
    row("⚡", "Kick", c.orange, `${c.cyan.bold(user)}  ${c.dim("in")}  ${c.dim(guild)}  ${c.dim("·")}  ${reason}`);
  },
  mute(user: string, guild: string, duration: string, reason: string): void {
    row("🔇", "Mute", c.purple, `${c.cyan.bold(user)}  ${c.dim(duration)}  ${c.dim("·")}  ${reason}`);
  },
  unmute(user: string, guild: string): void {
    row("🔊", "Unmute", c.green, `${c.cyan.bold(user)}  ${c.dim("in")}  ${c.dim(guild)}`);
  },
  warn(user: string, guild: string, count: number, reason: string): void {
    row("⚠️ ", `Warn [${count}]`, c.yellow, `${c.cyan.bold(user)}  ${c.dim("·")}  ${reason}`);
  },
  clear(channel: string, guild: string, count: number): void {
    row("🗑️ ", "Purge", c.blue, `${c.yellow.bold(String(count))} messages  ${c.dim("in")}  ${c.cyan.bold(channel)}`);
  },
  lock(channel: string, guild: string): void {
    row("🔒", "Lock", c.red, `${c.cyan.bold(channel)}  ${c.dim("in")}  ${c.dim(guild)}`);
  },
  unlock(channel: string, guild: string): void {
    row("🔓", "Unlock", c.green, `${c.cyan.bold(channel)}  ${c.dim("in")}  ${c.dim(guild)}`);
  },
  slowmode(channel: string, guild: string, seconds: number): void {
    const label = seconds === 0 ? c.green("off") : c.yellow(`${seconds}s`);
    row("🐢", "Slowmode", c.blue, `${c.cyan.bold(channel)}  ${c.dim("→")}  ${label}`);
  },
  automod(rule: string, user: string, guild: string, preview: string): void {
    const short = preview.replace(/\n/g, " ").slice(0, 40);
    row("🛡️ ", "Automod", c.magenta, `${c.magenta.bold(rule)}  ${c.dim("·")}  ${c.cyan.bold(user)}  ${c.dim(`"${short}${preview.length > 40 ? "…" : ""}"`)}`);
  },
  escalate(user: string, guild: string, action: string, warns: number): void {
    row("📈", "Escalate", c.red, `${c.cyan.bold(user)}  ${c.dim("→")}  ${c.red.bold(action)}  ${c.dim(`(${warns} warnings)`)}`);
  },
  join(user: string, guild: string): void {
    row("👾", "Join", c.green, `${c.cyan.bold(user)}  ${c.dim("→")}  ${c.dim(guild)}`);
  },
  leave(user: string, guild: string): void {
    row("🚪", "Leave", c.dim, `${c.cyan.bold(user)}  ${c.dim("←")}  ${c.dim(guild)}`);
  },
  command(name: string, user: string, guild: string): void {
    row("⌘ ", `/${name}`, c.dim, `${c.dim("by")}  ${c.cyan(user)}  ${c.dim("in")}  ${c.dim(guild)}`);
  },
  flag(user: string, guild: string, category: string): void {
    row("🚩", "Flag", c.yellow, `${c.cyan.bold(user)}  ${c.dim("·")}  ${c.yellow(category)}`);
  },
  error(msg: string): void {
    row("✖ ", "Error", c.red, c.red(msg));
  },
};
