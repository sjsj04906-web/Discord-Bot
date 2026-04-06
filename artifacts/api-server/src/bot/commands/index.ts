import type {
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import * as ban from "./ban.js";
import * as unban from "./unban.js";
import * as kick from "./kick.js";
import * as mute from "./mute.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";
import * as warningsCmd from "./warnings.js";
import * as clear from "./clear.js";
import * as slowmode from "./slowmode.js";
import * as lock from "./lock.js";
import * as unlock from "./unlock.js";
import * as userinfo from "./userinfo.js";
import * as serverinfo from "./serverinfo.js";
import * as tempban from "./tempban.js";
import * as note from "./note.js";
import * as poll from "./poll.js";
import * as role from "./role.js";
import * as automodconfig from "./automodconfig.js";
import * as removewarn from "./removewarn.js";

export interface SlashCommand {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const allCommands: SlashCommand[] = [
  ban, unban, kick, mute, unmute,
  warn, warningsCmd, removewarn, clear,
  slowmode, lock, unlock,
  userinfo, serverinfo,
  tempban, note, poll, role,
  automodconfig,
];
