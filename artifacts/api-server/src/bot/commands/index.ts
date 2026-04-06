import type {
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import * as ban from "./ban.js";
import * as unban from "./unban.js";
import * as kick from "./kick.js";
import * as mute from "./mute.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";
import * as warningsCmd from "./warnings.js";
import * as clear from "./clear.js";

export interface SlashCommand {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const allCommands: SlashCommand[] = [
  ban,
  unban,
  kick,
  mute,
  unmute,
  warn,
  warningsCmd,
  clear,
];
