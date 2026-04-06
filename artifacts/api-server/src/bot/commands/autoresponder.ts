import {
  SlashCommandBuilder, EmbedBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { getAutoResponders, addAutoResponder, removeAutoResponder } from "../db.js";
import { invalidateAutoResponderCache } from "../events/autoresponder.js";

const MATCH_TYPES = ["contains", "exact", "startswith"] as const;
type MatchType = typeof MATCH_TYPES[number];

const MATCH_LABELS: Record<MatchType, string> = {
  contains:   "Contains",
  exact:      "Exact",
  startswith: "Starts with",
};

// ── Prompt template library ───────────────────────────────────────────────────
export interface PromptTemplate {
  id:        string;
  label:     string;
  category:  string;
  trigger:   string;
  matchType: MatchType;
  response:  string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ── Info ────────────────────────────────────────────────────────────────────
  {
    id: "rules", label: "📜  Rules Reminder", category: "Info",
    trigger: "rules", matchType: "contains",
    response: "📜 Please review the server rules to keep the network stable. Violations may result in moderation action.",
  },
  {
    id: "ticket", label: "🎫  Support Ticket", category: "Info",
    trigger: "help", matchType: "contains",
    response: "🎫 Need assistance? Open a support request with `/ticket` and our staff team will respond shortly.",
  },
  {
    id: "commands", label: "⚡  Bot Commands", category: "Info",
    trigger: "commands", matchType: "contains",
    response: "⚡ Use `/` to browse all available commands. GL1TCH has 69 slash commands across moderation, economy, levelling, and more!",
  },
  {
    id: "staff", label: "🛡️  Reach Staff", category: "Info",
    trigger: "staff", matchType: "contains",
    response: "🛡️ To contact a staff member, please open a ticket with `/ticket` rather than DMing directly.",
  },
  {
    id: "invite", label: "📡  Server Invite", category: "Info",
    trigger: "invite", matchType: "contains",
    response: "📡 Use the server's invite link pinned in the info channel to bring friends to the network.",
  },
  // ── Economy ─────────────────────────────────────────────────────────────────
  {
    id: "daily", label: "🪙  Daily Reward", category: "Economy",
    trigger: "daily", matchType: "contains",
    response: "🪙 Claim your daily reward with `/daily`! Streaks give bonus coins — don't break the chain.",
  },
  {
    id: "balance", label: "💰  Check Balance", category: "Economy",
    trigger: "balance", matchType: "exact",
    response: "💰 Check your coin balance with `/balance`. Use `/richest` to see who's topping the server leaderboard.",
  },
  {
    id: "earn", label: "💡  How to Earn", category: "Economy",
    trigger: "how do i earn", matchType: "exact",
    response: "💡 Earn coins with `/work`, `/daily`, `/hourly`, and `/fish`. Risk it with `/gamble` or `/heist`. Store coins safely with `/bank deposit`.",
  },
  {
    id: "prestige", label: "⚜️  What is Prestige", category: "Economy",
    trigger: "what is prestige", matchType: "exact",
    response: "⚜️ Prestige resets your wallet for a permanent +10% income bonus per level (max 10 levels). Use `/prestige` once you hold 500,000 coins.",
  },
  {
    id: "bank", label: "🏦  Banking", category: "Economy",
    trigger: "bank", matchType: "contains",
    response: "🏦 Use `/bank deposit` to keep your coins safe — bank balance earns 2% daily interest and is protected from `/rob`.",
  },
  // ── Fun & Social ────────────────────────────────────────────────────────────
  {
    id: "gg", label: "⚡  GG Response", category: "Social",
    trigger: "gg", matchType: "exact",
    response: "⚡ GG! The grid remembers every run.",
  },
  {
    id: "gl", label: "🎯  GL Response", category: "Social",
    trigger: "gl", matchType: "exact",
    response: "🎯 GL — may the RNG be with you, choom.",
  },
  {
    id: "gm", label: "☀️  Good Morning", category: "Social",
    trigger: "good morning", matchType: "contains",
    response: "☀️ Morning, choom. The grid never sleeps — but you probably should've.",
  },
  {
    id: "gn", label: "🌙  Good Night", category: "Social",
    trigger: "good night", matchType: "contains",
    response: "🌙 Stay ghost. The network will be here when you wake.",
  },
  {
    id: "f", label: "🫡  Press F", category: "Social",
    trigger: "f", matchType: "exact",
    response: "🫡 F. Respect paid. The grid never forgets.",
  },
  // ── Cyberpunk vibe ───────────────────────────────────────────────────────────
  {
    id: "glitch", label: "👾  GL1TCH Mention", category: "Vibe",
    trigger: "glitch", matchType: "contains",
    response: "👾 Did someone say my name? GL1TCH online — systems nominal, ghost protocol active.",
  },
  {
    id: "hack", label: "💻  Hacking Reference", category: "Vibe",
    trigger: "hack", matchType: "contains",
    response: "💻 *taps earpiece* ...I'm in.",
  },
  {
    id: "cyberpunk", label: "🌃  Cyberpunk Vibe", category: "Vibe",
    trigger: "cyberpunk", matchType: "contains",
    response: "🌃 Night City never sleeps. Neither does the grid.",
  },
  {
    id: "rng", label: "🎲  RNG Complaint", category: "Vibe",
    trigger: "rng", matchType: "contains",
    response: "🎲 The RNG is immutable, choom. It sees all. It judges all.",
  },
  {
    id: "afk", label: "💤  AFK Notice", category: "Vibe",
    trigger: "afk", matchType: "contains",
    response: "💤 Going ghost? Don't forget to set your status with `/afk`!",
  },
  // ── Fun / Random words ───────────────────────────────────────────────────────
  {
    id: "bruh", label: "😐  Bruh", category: "Fun",
    trigger: "bruh", matchType: "exact",
    response: "bruh.",
  },
  {
    id: "skill_issue", label: "🔧  Skill Issue", category: "Fun",
    trigger: "skill issue", matchType: "exact",
    response: "Diagnostic complete: **SKILL ISSUE** confirmed. Recommend running `/work` for remediation.",
  },
  {
    id: "W", label: "🏆  W", category: "Fun",
    trigger: "W", matchType: "exact",
    response: "W logged. The grid pays its respects. 🏆",
  },
  {
    id: "L", label: "😔  L", category: "Fun",
    trigger: "L", matchType: "exact",
    response: "L detected. Recovery protocol: claim your `/daily` and try again tomorrow.",
  },
  {
    id: "pog", label: "📈  Pog", category: "Fun",
    trigger: "pog", matchType: "exact",
    response: "POG. Neural excitement indicators: **elevated**. 📈",
  },
  {
    id: "sus", label: "🔴  Sus", category: "Fun",
    trigger: "sus", matchType: "exact",
    response: "🔴 Sus flag raised. Running background scan... *beep boop* ...you're clean, choom. Probably.",
  },
  {
    id: "ratio", label: "📊  Ratio", category: "Fun",
    trigger: "ratio", matchType: "exact",
    response: "Ratio attempt registered. Calculating social damage... 📊 Results: **inconclusive**.",
  },
  {
    id: "based", label: "📡  Based", category: "Fun",
    trigger: "based", matchType: "exact",
    response: "**Based.** The grid agrees. Logged and verified. 📡",
  },
  {
    id: "no_cap", label: "🧢  No Cap", category: "Fun",
    trigger: "no cap", matchType: "exact",
    response: "No cap detected. Honesty protocol: **respected**. Signal verified.",
  },
  {
    id: "sheesh", label: "🌡️  Sheesh", category: "Fun",
    trigger: "sheesh", matchType: "contains",
    response: "SHEEEESH. Network temperature: **rising**. 🌡️",
  },
  {
    id: "cope", label: "😤  Cope", category: "Fun",
    trigger: "cope", matchType: "exact",
    response: "cope.exe detected. Skill issue identified. Recommend touching grass and re-running.",
  },
  {
    id: "rizz", label: "💅  Rizz", category: "Fun",
    trigger: "rizz", matchType: "contains",
    response: "Charisma stat: **off the charts**. The grid is intrigued. 💅",
  },
  {
    id: "vibe_check", label: "✅  Vibe Check", category: "Fun",
    trigger: "vibe check", matchType: "contains",
    response: "Vibe scan complete... ✅ Status: **immaculate**.",
  },
  {
    id: "slay", label: "💅  Slay", category: "Fun",
    trigger: "slay", matchType: "exact",
    response: "💅 Slay confirmed. The grid bows.",
  },
  {
    id: "mid", label: "😑  Mid", category: "Fun",
    trigger: "mid", matchType: "exact",
    response: "Mid detected. The grid has seen better. Have you considered `/prestige`?",
  },
];

const CATEGORY_COLORS: Record<string, number> = {
  Info:    THEME.info,
  Economy: THEME.economy,
  Social:  THEME.success,
  Vibe:    THEME.xp,
};

// ── Slash command definition ──────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("autoresponder")
  .setDescription("Manage automatic keyword responses")
  .setDefaultMemberPermissions(0x0000000000000008)
  .addSubcommand((s) =>
    s.setName("add")
      .setDescription("Add a new auto-response trigger")
      .addStringOption((o) => o.setName("trigger").setDescription("Keyword or phrase to listen for").setRequired(true))
      .addStringOption((o) => o.setName("response").setDescription("What the bot will reply").setRequired(true))
      .addStringOption((o) =>
        o.setName("match")
          .setDescription("How to match the trigger (default: contains)")
          .setRequired(false)
          .addChoices(
            { name: "Contains (anywhere in message)", value: "contains"   },
            { name: "Exact (entire message)",          value: "exact"      },
            { name: "Starts with",                     value: "startswith" },
          )
      )
  )
  .addSubcommand((s) =>
    s.setName("remove")
      .setDescription("Remove an auto-response trigger")
      .addStringOption((o) => o.setName("trigger").setDescription("Trigger to remove").setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("list")
      .setDescription("List all active auto-responses for this server")
  )
  .addSubcommand((s) =>
    s.setName("prompts")
      .setDescription("Browse and install pre-built response templates")
  );

// ── Main execute ──────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();

  // ── Add ───────────────────────────────────────────────────────────────────
  if (sub === "add") {
    const trigger   = interaction.options.getString("trigger", true).toLowerCase();
    const response  = interaction.options.getString("response", true);
    const matchType = (interaction.options.getString("match") ?? "contains") as MatchType;

    if (trigger.length > 100) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Trigger must be 100 characters or fewer.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (response.length > 2000) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Response must be 2000 characters or fewer.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = await getAutoResponders(interaction.guild.id);
    if (existing.length >= 50) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Maximum of 50 auto-responders per server.")], flags: MessageFlags.Ephemeral });
      return;
    }

    await addAutoResponder(interaction.guild.id, trigger, response, matchType);
    invalidateAutoResponderCache(interaction.guild.id);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🤖  Auto-Responder Installed  ·  ${BOT_NAME}` })
          .addFields(
            { name: "◈ Trigger",  value: `\`${trigger}\``,        inline: true },
            { name: "◈ Match",    value: MATCH_LABELS[matchType],  inline: true },
            { name: "◈ Response", value: response.slice(0, 1024),  inline: false },
          )
          .setFooter({ text: `${BOT_NAME}  ◆  Auto-Responder` })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Remove ────────────────────────────────────────────────────────────────
  if (sub === "remove") {
    const trigger = interaction.options.getString("trigger", true).toLowerCase();
    const removed = await removeAutoResponder(interaction.guild.id, trigger);
    invalidateAutoResponderCache(interaction.guild.id);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? THEME.success : THEME.danger)
          .setDescription(removed
            ? `> Trigger \`${trigger}\` deactivated and purged.`
            : `> No active trigger found for \`${trigger}\`.`)
          .setFooter({ text: `${BOT_NAME}  ◆  Auto-Responder` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── List ──────────────────────────────────────────────────────────────────
  if (sub === "list") {
    const responders = await getAutoResponders(interaction.guild.id);

    if (responders.length === 0) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.muted)
            .setAuthor({ name: `🤖  Auto-Responders  ·  ${BOT_NAME}` })
            .setDescription(`> No triggers active. Use \`/autoresponder add\` or \`/autoresponder prompts\` to get started.`)
            .setFooter({ text: `0 / 50 slots used  ·  ${BOT_NAME} ◆ Auto-Responder` }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = responders.map((r, i) =>
      `**${i + 1}.** \`${r.trigger}\` — *${MATCH_LABELS[r.matchType as MatchType] ?? r.matchType}*\n↳ ${r.response.slice(0, 80)}${r.response.length > 80 ? "…" : ""}`
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.xp)
          .setAuthor({ name: `🤖  Active Auto-Responders  ·  ${BOT_NAME}` })
          .setDescription(lines.join("\n\n"))
          .setFooter({ text: `${responders.length} / 50 slots used  ·  ${BOT_NAME} ◆ Auto-Responder` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Prompts ───────────────────────────────────────────────────────────────
  if (sub === "prompts") {
    await showPromptsMenu(interaction);
  }
}

// Split templates into two buckets so neither exceeds Discord's 25-option cap
const UTILITY_CATS = ["Info", "Economy"];
const FUN_CATS     = ["Social", "Vibe", "Fun"];

function utilityTemplates() { return PROMPT_TEMPLATES.filter((t) => UTILITY_CATS.includes(t.category)); }
function funTemplates()     { return PROMPT_TEMPLATES.filter((t) => FUN_CATS.includes(t.category)); }

function buildMenu(
  templates: PromptTemplate[],
  customId: string,
  placeholder: string,
  active: Set<string>,
): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(templates.length)
    .addOptions(
      templates.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setValue(t.id)
          .setLabel(t.label.replace(/^\S+\s+/, "").trim().slice(0, 100))
          .setDescription(`"${t.trigger}" · ${MATCH_LABELS[t.matchType]}`.slice(0, 100))
          .setEmoji(t.label.match(/^(\S+)/)?.[1] ?? "◈")
          .setDefault(active.has(t.trigger))
      )
    );
}

// ── Prompts menu ──────────────────────────────────────────────────────────────
async function showPromptsMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const existing       = await getAutoResponders(interaction.guild.id);
  const activeTriggers = new Set(existing.map((r) => r.trigger));
  const gid            = interaction.guild.id;

  const allCats = [...new Set(PROMPT_TEMPLATES.map((t) => t.category))];
  const descLines: string[] = [
    `Pick prompts from either menu below to install them instantly.`,
    `✅ = already active on this server.`,
    SEP,
  ];
  for (const cat of allCats) {
    const tpls = PROMPT_TEMPLATES.filter((t) => t.category === cat);
    descLines.push(`**${cat}**`);
    for (const t of tpls) {
      const active = activeTriggers.has(t.trigger);
      descLines.push(`${active ? "✅" : "◈"} ${t.label}  —  \`${t.trigger}\` *(${MATCH_LABELS[t.matchType]})*`);
    }
  }

  const utilMenu = buildMenu(utilityTemplates(), `ar_prompt_install_${gid}`, "📋 Utility prompts (Info & Economy)…", activeTriggers);
  const funMenu  = buildMenu(funTemplates(),     `ar_prompt_fun_${gid}`,     "🎉 Fun & Social prompts…",             activeTriggers);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.xp)
        .setAuthor({ name: `🤖  Prompt Library  ·  ${BOT_NAME}` })
        .setDescription(descLines.join("\n"))
        .setFooter({ text: `${existing.length} / 50 slots used  ·  ${PROMPT_TEMPLATES.length} prompts available  ·  ${BOT_NAME} ◆ Auto-Responder` }),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(utilMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(funMenu),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Select menu interaction handler ──────────────────────────────────────────
export async function handlePromptInstall(interaction: StringSelectMenuInteraction, guildId: string) {
  await interaction.deferUpdate();

  const selected   = interaction.values;
  const templates  = PROMPT_TEMPLATES.filter((t) => selected.includes(t.id));
  if (templates.length === 0) return;

  const existing       = await getAutoResponders(guildId);
  const activeTriggers = new Set(existing.map((r) => r.trigger));
  const slotsLeft      = 50 - existing.length;

  const toInstall   = templates.filter((t) => !activeTriggers.has(t.trigger));
  const alreadyHave = templates.filter((t) =>  activeTriggers.has(t.trigger));
  const truncated   = toInstall.slice(0, slotsLeft);
  const overflow    = toInstall.slice(slotsLeft);

  for (const t of truncated) {
    await addAutoResponder(guildId, t.trigger, t.response, t.matchType);
  }
  invalidateAutoResponderCache(guildId);

  const lines: string[] = [];
  if (truncated.length > 0)   lines.push(`**Installed (${truncated.length})**\n` + truncated.map((t) => `✅ ${t.label}  —  \`${t.trigger}\``).join("\n"));
  if (alreadyHave.length > 0) lines.push(`**Already active (${alreadyHave.length})**\n` + alreadyHave.map((t) => `◈ ${t.label}`).join("\n"));
  if (overflow.length > 0)    lines.push(`**Skipped — no slots (${overflow.length})**\n` + overflow.map((t) => `❌ ${t.label}`).join("\n"));

  const allNow = await getAutoResponders(guildId);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(truncated.length > 0 ? THEME.success : THEME.warn)
        .setAuthor({ name: `🤖  Prompts Installed  ·  ${BOT_NAME}` })
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `${allNow.length} / 50 slots used  ·  ${BOT_NAME} ◆ Auto-Responder` })
        .setTimestamp(),
    ],
    components: [],
  });
}
