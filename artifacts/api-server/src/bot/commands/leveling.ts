import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import {
  setGuildConfig,
  getGuildConfig,
  saveLevelRole,
  getLevelRoles,
  setUserXp,
  resetUserXp,
  getOrCreateXp,
} from "../db.js";
import { levelFromXp } from "../utils/xpMath.js";

// ── Cyberpunk-themed default level roles ─────────────────────────────────────
const DEFAULT_LEVEL_ROLES: Array<{ level: number; name: string; color: number }> = [
  { level: 1,    name: "Lurker",               color: 0x36393F },
  { level: 3,    name: "Observer",             color: 0x747F8D },
  { level: 5,    name: "Initiate",             color: 0x5865F2 },
  { level: 8,    name: "Recruit",              color: 0x4E9FE5 },
  { level: 10,   name: "Operative",            color: 0x3BA55D },
  { level: 13,   name: "Freelancer",           color: 0x27AE60 },
  { level: 15,   name: "Agent",                color: 0x1ABC9C },
  { level: 18,   name: "Cipher",               color: 0x16A085 },
  { level: 20,   name: "Netrunner",            color: 0x9C84EF },
  { level: 23,   name: "Wire Rat",             color: 0x8E44AD },
  { level: 25,   name: "Hacker",               color: 0x7289DA },
  { level: 28,   name: "Script Kiddie",        color: 0x5D6D7E },
  { level: 30,   name: "Ghost",                color: 0xBCC0C0 },
  { level: 33,   name: "Shadow",               color: 0x95A5A6 },
  { level: 35,   name: "Phantom",              color: 0xEB459E },
  { level: 38,   name: "Wraith",               color: 0xAF7AC5 },
  { level: 40,   name: "Infiltrator",          color: 0x2ECC71 },
  { level: 45,   name: "Black Hat",            color: 0x1A1A2E },
  { level: 50,   name: "Glitch",               color: 0xFEE75C },
  { level: 55,   name: "Synth",                color: 0xF7DC6F },
  { level: 60,   name: "Renegade",             color: 0xE67E22 },
  { level: 65,   name: "Overclocked",          color: 0xD35400 },
  { level: 70,   name: "Daemon",               color: 0xC0392B },
  { level: 75,   name: "Corrupted",            color: 0xED4245 },
  { level: 80,   name: "Void Walker",          color: 0x922B21 },
  { level: 85,   name: "Specter",              color: 0x992D22 },
  { level: 90,   name: "Malware",              color: 0x7B241C },
  { level: 95,   name: "Zero Day",             color: 0x641E16 },
  { level: 100,  name: "System Override",      color: 0xFFD700 },
  { level: 110,  name: "Neural Link",          color: 0xF0E68C },
  { level: 125,  name: "Cyborg",               color: 0x00FFFF },
  { level: 140,  name: "Chrome",               color: 0xC0C0C0 },
  { level: 150,  name: "Apex",                 color: 0xFF6B35 },
  { level: 165,  name: "Overclock",            color: 0xFF4500 },
  { level: 175,  name: "Transcendent",         color: 0xDA70D6 },
  { level: 200,  name: "Architect",            color: 0xF1C40F },
  { level: 250,  name: "Singularity",          color: 0xFFFFFF },
  { level: 300,  name: "Dark Matter",          color: 0x0D0D0D },
  { level: 400,  name: "Extinction Protocol",  color: 0x8B0000 },
  { level: 500,  name: "God Mode",             color: 0xFF69B4 },
  { level: 750,  name: "The Anomaly",          color: 0x39FF14 },
  { level: 1000, name: "Cyber Psycho",         color: 0xFF0000 },
];

export const data = new SlashCommandBuilder()
  .setName("leveling")
  .setDescription("Manage the XP levelling system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("setup")
      .setDescription("Create all level roles in the server automatically")
  )
  .addSubcommand((sub) =>
    sub.setName("enable")
      .setDescription("Enable XP levelling")
  )
  .addSubcommand((sub) =>
    sub.setName("disable")
      .setDescription("Disable XP levelling (keeps all XP data)")
  )
  .addSubcommand((sub) =>
    sub.setName("channel")
      .setDescription("Set a dedicated channel for level-up announcements")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel for level-up messages").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("setxp")
      .setDescription("Set a member's XP directly (admin)")
      .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("XP to set").setMinValue(0).setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("resetxp")
      .setDescription("Reset a member's XP and level to zero (admin)")
      .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("roles")
      .setDescription("Show all configured level roles")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (sub === "setup") {
    await interaction.deferReply();

    const created: string[] = [];
    const skipped: string[] = [];

    const existing = await getLevelRoles(interaction.guild.id);
    const existingLevels = new Set(existing.map((r) => r.level));

    for (const def of DEFAULT_LEVEL_ROLES) {
      if (existingLevels.has(def.level)) {
        skipped.push(`Lv ${def.level} — ${def.name} (already exists)`);
        continue;
      }
      try {
        const role = await interaction.guild.roles.create({
          name:   def.name,
          color:  def.color,
          reason: `GL1TCH leveling setup — Level ${def.level} role`,
        });
        await saveLevelRole(interaction.guild.id, def.level, role.id, def.name);
        created.push(`Lv **${def.level}** — <@&${role.id}> (${def.name})`);
      } catch {
        skipped.push(`Lv ${def.level} — ${def.name} (failed, check bot role permissions)`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(THEME.success)
      .setAuthor({ name: `✅  Leveling Setup Complete  ·  ${BOT_NAME}` })
      .setDescription("All level roles have been created and registered. Members will automatically receive their role when they hit the required level.")
      .setFooter({ text: `${BOT_NAME}  ·  XP is earned from chatting (15-25 per message, 60s cooldown)` })
      .setTimestamp();

    if (created.length > 0) embed.addFields({ name: "✅ Roles Created", value: created.join("\n") });
    if (skipped.length > 0) embed.addFields({ name: "⏭️ Skipped", value: skipped.join("\n") });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── Enable ─────────────────────────────────────────────────────────────────
  if (sub === "enable") {
    await setGuildConfig(interaction.guild.id, { levelingEnabled: true });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.success).setDescription("✅ Leveling enabled. Members earn XP from chatting.")],
      ephemeral: true,
    });
    return;
  }

  // ── Disable ────────────────────────────────────────────────────────────────
  if (sub === "disable") {
    await setGuildConfig(interaction.guild.id, { levelingEnabled: false });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription("⏸️ Leveling disabled. All XP data is preserved.")],
      ephemeral: true,
    });
    return;
  }

  // ── Channel ────────────────────────────────────────────────────────────────
  if (sub === "channel") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await setGuildConfig(interaction.guild.id, { levelUpChannelId: ch.id });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.success).setDescription(`✅ Level-up announcements will now go to ${ch}.`)],
      ephemeral: true,
    });
    return;
  }

  // ── Set XP ─────────────────────────────────────────────────────────────────
  if (sub === "setxp") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    await setUserXp(interaction.guild.id, target.id, amount);
    const newLevel = levelFromXp(amount);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.success).setDescription(`✅ Set ${target}'s XP to **${amount.toLocaleString()}** (Level **${newLevel}**).`)],
      ephemeral: true,
    });
    return;
  }

  // ── Reset XP ───────────────────────────────────────────────────────────────
  if (sub === "resetxp") {
    const target = interaction.options.getUser("user", true);
    await resetUserXp(interaction.guild.id, target.id);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription(`✅ Reset ${target}'s XP and level to zero.`)],
      ephemeral: true,
    });
    return;
  }

  // ── Roles ──────────────────────────────────────────────────────────────────
  if (sub === "roles") {
    const roles = await getLevelRoles(interaction.guild.id);
    if (roles.length === 0) {
      await interaction.reply({ content: "No level roles configured. Run `/leveling setup` to create them.", ephemeral: true });
      return;
    }

    const lines = roles
      .sort((a, b) => a.level - b.level)
      .map((r) => `Lv **${r.level}** — <@&${r.roleId}> (${r.roleName})`);

    const embed = new EmbedBuilder()
      .setColor(THEME.info)
      .setAuthor({ name: `🏅  Level Roles  ·  ${BOT_NAME}` })
      .setDescription(lines.join("\n"))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
