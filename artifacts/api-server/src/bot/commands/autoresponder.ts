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

// ── Prompts menu ──────────────────────────────────────────────────────────────
async function showPromptsMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const existing    = await getAutoResponders(interaction.guild.id);
  const activeTriggers = new Set(existing.map((r) => r.trigger));

  const categories = [...new Set(PROMPT_TEMPLATES.map((t) => t.category))];

  const descLines: string[] = [
    `Pick one or more prompts from the menu below to install them instantly.`,
    `Already-active triggers are marked ✅.`,
    SEP,
  ];

  for (const cat of categories) {
    const templates = PROMPT_TEMPLATES.filter((t) => t.category === cat);
    descLines.push(`**${cat}**`);
    for (const t of templates) {
      const active = activeTriggers.has(t.trigger);
      descLines.push(`${active ? "✅" : "◈"} ${t.label}  —  \`${t.trigger}\` *(${MATCH_LABELS[t.matchType]})*`);
    }
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ar_prompt_install_${interaction.guild.id}`)
    .setPlaceholder("Select prompts to install…")
    .setMinValues(1)
    .setMaxValues(Math.min(PROMPT_TEMPLATES.length, 25))
    .addOptions(
      PROMPT_TEMPLATES.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setValue(t.id)
          .setLabel(t.label.replace(/^\S+\s+/, ""))
          .setDescription(`Trigger: "${t.trigger}" · ${MATCH_LABELS[t.matchType]}`)
          .setEmoji(t.label.match(/^(\S+)/)?.[1] ?? "◈")
          .setDefault(activeTriggers.has(t.trigger))
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME.xp)
        .setAuthor({ name: `🤖  Prompt Library  ·  ${BOT_NAME}` })
        .setDescription(descLines.join("\n"))
        .setFooter({ text: `${existing.length} / 50 slots used  ·  ${BOT_NAME} ◆ Auto-Responder` }),
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Select menu interaction handler ──────────────────────────────────────────
export async function handlePromptInstall(interaction: StringSelectMenuInteraction, guildId: string) {
  await interaction.deferUpdate();

  const selected = interaction.values;
  const templates = PROMPT_TEMPLATES.filter((t) => selected.includes(t.id));
  if (templates.length === 0) return;

  const existing      = await getAutoResponders(guildId);
  const activeTriggers = new Set(existing.map((r) => r.trigger));
  const slotsLeft     = 50 - existing.length;

  const toInstall   = templates.filter((t) => !activeTriggers.has(t.trigger));
  const alreadyHave = templates.filter((t) => activeTriggers.has(t.trigger));
  const truncated   = toInstall.slice(0, slotsLeft);
  const skipped     = toInstall.slice(slotsLeft);

  for (const t of truncated) {
    await addAutoResponder(guildId, t.trigger, t.response, t.matchType);
  }
  invalidateAutoResponderCache(guildId);

  const lines: string[] = [];
  if (truncated.length > 0)   lines.push(`**Installed (${truncated.length})**\n` + truncated.map((t) => `✅ ${t.label}  —  \`${t.trigger}\``).join("\n"));
  if (alreadyHave.length > 0) lines.push(`**Already active (${alreadyHave.length})**\n` + alreadyHave.map((t) => `◈ ${t.label}`).join("\n"));
  if (skipped.length > 0)     lines.push(`**Skipped — no slots (${skipped.length})**\n` + skipped.map((t) => `❌ ${t.label}`).join("\n"));

  const allNew = await getAutoResponders(guildId);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(truncated.length > 0 ? THEME.success : THEME.warn)
        .setAuthor({ name: `🤖  Prompts Installed  ·  ${BOT_NAME}` })
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `${allNew.length} / 50 slots used  ·  ${BOT_NAME} ◆ Auto-Responder` })
        .setTimestamp(),
    ],
    components: [],
  });
}
