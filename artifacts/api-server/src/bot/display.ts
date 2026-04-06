import chalk, { type ChalkInstance } from "chalk";
import { BOT_NAME, BOT_SUBTITLE } from "./theme.js";

const c = {
  cyan:    chalk.hex("#00FFE5"),
  magenta: chalk.hex("#FF00AA"),
  purple:  chalk.hex("#9D00FF"),
  yellow:  chalk.hex("#FFE600"),
  green:   chalk.hex("#00FF88"),
  red:     chalk.hex("#FF003C"),
  orange:  chalk.hex("#FF6B00"),
  blue:    chalk.hex("#0066FF"),
  dim:     chalk.hex("#444466"),
  white:   chalk.hex("#E0E0FF"),
  bold:    chalk.bold,
};

const GLITCH_CHARS = ["▓", "░", "▒", "◈", "◆", "▸"];
function glitch(): string {
  return c.magenta(GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]!);
}

function ts(): string {
  return c.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));
}

function loadBar(value: number, max: number, width = 10): string {
  const filled = Math.round((value / max) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return c.cyan(bar);
}

export function printBanner(tag: string, guilds: number, members: number, commandCount: number): void {
  const width = 62;
  const line = "═".repeat(width);
  const inner = `  ${glitch()}  ${BOT_NAME}  ${c.dim("◈")}  ${c.white(BOT_SUBTITLE)}  ${glitch()}  `;

  const visibleInnerLen = BOT_NAME.length + BOT_SUBTITLE.replace(/ /g, "").length + 10;
  const pad = Math.max(0, Math.floor((width - visibleInnerLen) / 2));

  process.stdout.write("\n");
  process.stdout.write(c.cyan(`╔${line}╗\n`));
  process.stdout.write(c.cyan("║") + " ".repeat(pad) + inner + " ".repeat(Math.max(0, width - pad - visibleInnerLen)) + c.cyan("║\n"));
  process.stdout.write(c.cyan(`╚${line}╝\n`));
  process.stdout.write("\n");

  process.stdout.write(`  ${c.magenta("▸")}  ${c.dim("UNIT:")}      ${c.cyan.bold(tag)}\n`);
  process.stdout.write(`  ${c.magenta("▸")}  ${c.dim("NETWORKS:")}  ${c.cyan.bold(String(guilds))} ${guilds === 1 ? "node" : "nodes"}  ${c.dim("//")}  ${c.cyan.bold(String(members))} entities\n`);
  process.stdout.write(`  ${c.magenta("▸")}  ${c.dim("PROTOCOLS:")} ${c.cyan.bold(String(commandCount))} loaded\n`);
  process.stdout.write(`  ${c.magenta("▸")}  ${c.dim("AUTOMOD:")}   [${loadBar(10, 10)}] ${c.green.bold("ACTIVE")}\n`);
  process.stdout.write("\n");
  process.stdout.write(c.dim("─".repeat(64)) + "\n");
}

function row(icon: string, label: string, color: ChalkInstance, detail: string): void {
  const paddedLabel = label.padEnd(11);
  process.stdout.write(
    `  ${ts()}  ${icon}  ${color.bold(paddedLabel)}${c.dim("◈")}  ${c.white(detail)}\n`
  );
}

export const log = {
  ban(user: string, guild: string, reason: string): void {
    row("💀", "BAN", c.red, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("→")} ${reason}`);
  },
  unban(user: string, guild: string): void {
    row("🔓", "UNBAN", c.green, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)}`);
  },
  kick(user: string, guild: string, reason: string): void {
    row("⚡", "KICK", c.orange, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("→")} ${reason}`);
  },
  mute(user: string, guild: string, duration: string, reason: string): void {
    row("🔇", "MUTE", c.purple, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("×")} ${c.yellow(duration)} ${c.dim("→")} ${reason}`);
  },
  unmute(user: string, guild: string): void {
    row("🔊", "UNMUTE", c.green, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)}`);
  },
  warn(user: string, guild: string, count: number, reason: string): void {
    row("⚠ ", `WARN [${count}]`, c.yellow, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("→")} ${reason}`);
  },
  clear(channel: string, guild: string, count: number): void {
    row("🗑 ", "PURGE", c.blue, `${c.yellow.bold(String(count))} msgs ${c.dim("//")} ${c.cyan.bold(channel)} ${c.dim("in")} ${c.dim(guild)}`);
  },
  lock(channel: string, guild: string): void {
    row("🔒", "LOCK", c.red, `${c.cyan.bold(channel)} ${c.dim("//")} ${c.dim(guild)}`);
  },
  unlock(channel: string, guild: string): void {
    row("🔓", "UNLOCK", c.green, `${c.cyan.bold(channel)} ${c.dim("//")} ${c.dim(guild)}`);
  },
  slowmode(channel: string, guild: string, seconds: number): void {
    const label = seconds === 0 ? c.green("OFF") : c.yellow(`${seconds}s`);
    row("🐢", "SLOWMODE", c.blue, `${c.cyan.bold(channel)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("→")} ${label}`);
  },
  automod(rule: string, user: string, guild: string, preview: string): void {
    const short = preview.replace(/\n/g, " ").slice(0, 38);
    row("🛡 ", "AUTOMOD", c.magenta, `${c.magenta.bold(rule)} ${c.dim("→")} ${c.cyan.bold(user)} ${c.dim(`"${short}${preview.length > 38 ? "…" : ""}"`)} `);
  },
  escalate(user: string, guild: string, action: string, warns: number): void {
    row("📈", "ESCALATE", c.red, `${c.cyan.bold(user)} ${c.dim("//")} ${c.dim(guild)} ${c.dim("→")} ${c.red.bold(action)} ${c.dim(`after ${warns} warns`)}`);
  },
  join(user: string, guild: string): void {
    row("👾", "CONNECT", c.green, `${c.cyan.bold(user)} ${c.dim("→")} ${c.dim(guild)}`);
  },
  command(name: string, user: string, guild: string): void {
    row("⌘ ", `/${name}`, c.dim, `${c.dim("by")} ${c.cyan(user)} ${c.dim("in")} ${c.dim(guild)}`);
  },
  error(msg: string): void {
    row("✖ ", "ERROR", c.red, c.red(msg));
  },
};
