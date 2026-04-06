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
import * as permissions from "./permissions.js";
import * as history from "./history.js";
import * as report from "./report.js";
import * as stats from "./stats.js";
import * as antiraid from "./antiraid.js";
import * as tempmute from "./tempmute.js";
import * as bulkban from "./bulkban.js";
import * as caseCmd from "./case.js";
import * as welcome from "./welcome.js";
import * as ticket from "./ticket.js";
import * as temprole from "./temprole.js";
import * as reactionrole from "./reactionrole.js";
import * as exportwarns from "./exportwarns.js";
import * as autorole from "./autorole.js";
import * as modmailcmd from "./modmailcmd.js";

export interface SlashCommand {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const allCommands: SlashCommand[] = [
  ban, unban, kick, mute, unmute, tempmute,
  warn, warningsCmd, removewarn, clear, bulkban,
  slowmode, lock, unlock,
  userinfo, serverinfo,
  tempban, note, poll, role,
  automodconfig, permissions,
  history, report, stats, antiraid,
  caseCmd, welcome, ticket, temprole, reactionrole, exportwarns,
  autorole, modmailcmd,
];
