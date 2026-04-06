import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from "discord.js";
import type { SlashCommand } from "./commands/index.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

export const commands = new Collection<string, SlashCommand>();
