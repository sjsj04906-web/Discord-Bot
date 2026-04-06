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
import * as messagelog from "./messagelog.js";
import * as adminlog from "./adminlog.js";
import * as modlog from "./modlog.js";
import * as rules from "./rules.js";
import * as softban from "./softban.js";
import * as snipe from "./snipe.js";
import * as afk from "./afk.js";
import * as verify from "./verify.js";
import * as serverstats from "./serverstats.js";
import * as mydata from "./mydata.js";
import * as modstats from "./modstats.js";
import * as remind from "./remind.js";
import * as rank from "./rank.js";
import * as leaderboard from "./leaderboard.js";
import * as leveling from "./leveling.js";
import * as counting from "./counting.js";
import * as suggestions from "./suggestions.js";
import * as suggestion from "./suggestion.js";
import * as balance from "./balance.js";
import * as daily from "./daily.js";
import * as hourly from "./hourly.js";
import * as work from "./work.js";
import * as pay from "./pay.js";
import * as shop from "./shop.js";
import * as richest from "./richest.js";
import * as economy from "./economy.js";
import * as gamble from "./gamble.js";
import * as rob from "./rob.js";
import * as bank from "./bank.js";
import * as fish from "./fish.js";
import * as heist from "./heist.js";
import * as achievements from "./achievements.js";
import * as autoresponder from "./autoresponder.js";
import * as duel from "./duel.js";
import * as prestige from "./prestige.js";

export interface SlashCommand {
  data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const allCommands: SlashCommand[] = [
  ban, unban, kick, mute, unmute, tempmute,
  warn, warningsCmd, removewarn, clear, bulkban, softban,
  slowmode, lock, unlock,
  userinfo, serverinfo,
  tempban, note, poll, role,
  automodconfig, permissions,
  history, report, stats, antiraid,
  caseCmd, welcome, ticket, temprole, reactionrole, exportwarns,
  autorole, modmailcmd, messagelog, adminlog, modlog,
  snipe, afk, verify, serverstats, rules,
  mydata,
  modstats,
  remind,
  rank,
  leaderboard,
  leveling,
  counting,
  suggestions, suggestion,
  balance, daily, hourly, work, pay, shop, richest, economy, gamble,
  rob, bank, fish, heist, duel,
  achievements, prestige,
  autoresponder,
];
