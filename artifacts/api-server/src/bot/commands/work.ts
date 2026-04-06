import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, addBalance, updateLastWork } from "../db.js";
import { prestigeBadge, PRESTIGE_BONUS } from "./prestige.js";

const JOBS = [
  { label: "hacked a server",          min: 30, max: 90  },
  { label: "ran a phishing scam",       min: 20, max: 70  },
  { label: "sold stolen data",          min: 40, max: 120 },
  { label: "cracked a firewall",        min: 50, max: 130 },
  { label: "mined crypto illegally",    min: 25, max: 80  },
  { label: "deployed a botnet",         min: 35, max: 100 },
  { label: "spoofed a DNS record",      min: 15, max: 60  },
  { label: "reverse-engineered malware",min: 60, max: 150 },
  { label: "wrote ransomware",          min: 80, max: 200 },
  { label: "social-engineered a bank",  min: 70, max: 180 },
  { label: "exploited a zero-day",      min: 100,max: 250 },
  { label: "sold an 0-day on the dark web", min: 90, max: 220 },
];

export const data = new SlashCommandBuilder()
  .setName("work")
  .setDescription("Work for some coins (cyberpunk-style)");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const config = await getGuildConfig(interaction.guild.id);
  const eco = await getBalance(interaction.guild.id, interaction.user.id);
  const em = config.currencyEmoji;
  const cooldownMs = config.workCooldownMins * 60 * 1000;

  if (eco.lastWork && Date.now() - eco.lastWork.getTime() < cooldownMs) {
    const next = eco.lastWork.getTime() + cooldownMs;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`⏳ You're on cooldown. Get back to work <t:${Math.floor(next / 1000)}:R>!`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const job        = JOBS[Math.floor(Math.random() * JOBS.length)]!;
  const multiplier = 1 + eco.prestige * PRESTIGE_BONUS;
  const earned     = Math.floor((job.min + Math.random() * (job.max - job.min)) * multiplier);

  await updateLastWork(interaction.guild.id, interaction.user.id);
  const newBal = await addBalance(interaction.guild.id, interaction.user.id, earned);
  const badge  = prestigeBadge(eco.prestige);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setAuthor({ name: `💻  Work Complete  ·  ${BOT_NAME}` })
        .setDescription(`> You ${job.label} and earned **+${earned} ${em}**${eco.prestige > 0 ? `\n> *${badge}Prestige ${eco.prestige} bonus applied*` : ""}`)
        .addFields(
          { name: "New Balance", value: `${newBal.toLocaleString()} ${em}`, inline: true },
          { name: "Cooldown",    value: `${config.workCooldownMins} min`,    inline: true },
        )
        .setFooter({ text: `${BOT_NAME}  ·  Economy` })
        .setTimestamp(),
    ],
  });
}
