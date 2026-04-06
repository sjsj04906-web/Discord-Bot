import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME, SEP } from "../theme.js";
import { getBalance, deductBalance, addBalance } from "../db.js";
import { db, bountiesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const MAX_BOUNTY  = 1_000_000;
const MIN_BOUNTY  = 500;

// ── DB helpers ────────────────────────────────────────────────────────────────
export async function getActiveBounties(guildId: string) {
  return db
    .select()
    .from(bountiesTable)
    .where(and(eq(bountiesTable.guildId, guildId), eq(bountiesTable.active, true)))
    .orderBy(desc(bountiesTable.amount));
}

export async function getBountiesOnTarget(guildId: string, targetId: string) {
  return db
    .select()
    .from(bountiesTable)
    .where(and(eq(bountiesTable.guildId, guildId), eq(bountiesTable.targetId, targetId), eq(bountiesTable.active, true)));
}

export async function postBounty(guildId: string, posterId: string, targetId: string, amount: number) {
  await db
    .insert(bountiesTable)
    .values({ guildId, posterId, targetId, amount })
    .onConflictDoUpdate({
      target: [bountiesTable.guildId, bountiesTable.targetId, bountiesTable.posterId],
      set: { amount, active: true, claimedBy: null, claimedAt: null },
    });
}

export async function claimBounties(guildId: string, targetId: string, claimerId: string): Promise<number> {
  const bounties = await getBountiesOnTarget(guildId, targetId);
  if (bounties.length === 0) return 0;

  const total = bounties.reduce((s, b) => s + b.amount, 0);
  const now   = new Date();

  for (const b of bounties) {
    await db
      .update(bountiesTable)
      .set({ active: false, claimedBy: claimerId, claimedAt: now })
      .where(eq(bountiesTable.id, b.id));
  }

  await addBalance(guildId, claimerId, total);
  return total;
}

export async function cancelBounty(guildId: string, posterId: string, targetId: string): Promise<number> {
  const rows = await db
    .select()
    .from(bountiesTable)
    .where(and(
      eq(bountiesTable.guildId, guildId),
      eq(bountiesTable.posterId, posterId),
      eq(bountiesTable.targetId, targetId),
      eq(bountiesTable.active, true),
    ));
  if (rows.length === 0) return 0;
  const refund = rows[0].amount;
  await db
    .update(bountiesTable)
    .set({ active: false })
    .where(eq(bountiesTable.id, rows[0].id));
  await addBalance(guildId, posterId, refund);
  return refund;
}

// ── Slash command ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("bounty")
  .setDescription("Post or view coin bounties on server members.")
  .addSubcommand((s) => s
    .setName("set")
    .setDescription("Place a coin bounty on a user — paid out to whoever robs them next.")
    .addUserOption((o) => o.setName("target").setDescription("The target").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("Coins to stake").setRequired(true).setMinValue(MIN_BOUNTY).setMaxValue(MAX_BOUNTY)))
  .addSubcommand((s) => s
    .setName("list")
    .setDescription("View all active bounties on this server."))
  .addSubcommand((s) => s
    .setName("cancel")
    .setDescription("Cancel your own bounty on a user and get a refund.")
    .addUserOption((o) => o.setName("target").setDescription("The target").setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;

  // ── /bounty set ──────────────────────────────────────────────────────────────
  if (sub === "set") {
    const target = interaction.options.getUser("target", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.id === userId) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> You can't put a bounty on yourself.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.bot) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("> Bots can't be bounty targets.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const bal = await getBalance(guildId, userId);
    if (bal.balance < amount) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> You need **${amount.toLocaleString()}** coins. You have **${bal.balance.toLocaleString()}**.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    // Prevent re-posting on the same target (would silently eat the first stake)
    const existing = await getBountiesOnTarget(guildId, target.id).then((rows) => rows.find((r) => r.posterId === userId));
    if (existing) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.warn).setDescription(`> You already have an active bounty on **${target.username}** for 🪙 **${existing.amount.toLocaleString()}** coins.\n> Cancel it first with \`/bounty cancel\` if you want to change the amount.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await deductBalance(guildId, userId, amount);
    await postBounty(guildId, userId, target.id, amount);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setAuthor({ name: `🎯  Bounty Posted  ·  ${BOT_NAME}` })
          .setDescription(`> A bounty has been placed on **${target.username}**.\n> Anyone who successfully robs them will collect the reward.`)
          .addFields(
            { name: "◈ Target",  value: `<@${target.id}>`,              inline: true },
            { name: "◈ Reward",  value: `🪙 ${amount.toLocaleString()}`, inline: true },
          )
          .setFooter({ text: `${BOT_NAME} ◆ Bounty Board` })
          .setTimestamp(),
      ],
    });
    return;
  }

  // ── /bounty list ─────────────────────────────────────────────────────────────
  if (sub === "list") {
    const bounties = await getActiveBounties(guildId);

    if (bounties.length === 0) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.muted).setDescription(`> No active bounties. Be the first to mark a target with \`/bounty set\`.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = bounties.map((b, i) =>
      `**${i + 1}.** <@${b.targetId}>  —  🪙 **${b.amount.toLocaleString()}**  ·  Posted by <@${b.posterId}>`
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setAuthor({ name: `🎯  Bounty Board  ·  ${BOT_NAME}` })
          .setDescription(`${SEP}\n${lines.join("\n")}\n${SEP}`)
          .setFooter({ text: `${bounties.length} active ${bounties.length === 1 ? "bounty" : "bounties"}  ·  ${BOT_NAME} ◆ Bounty Board` }),
      ],
    });
    return;
  }

  // ── /bounty cancel ───────────────────────────────────────────────────────────
  if (sub === "cancel") {
    const target = interaction.options.getUser("target", true);
    const refund = await cancelBounty(guildId, userId, target.id);

    if (refund === 0) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`> You have no active bounty on <@${target.id}>.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.warn)
          .setDescription(`> 🎯 Bounty on <@${target.id}> cancelled. **${refund.toLocaleString()} coins** refunded.`)
          .setFooter({ text: `${BOT_NAME} ◆ Bounty Board` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
