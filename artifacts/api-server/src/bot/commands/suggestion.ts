import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getSuggestion, updateSuggestionStatus } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("suggestion")
  .setDescription("Manage a submitted suggestion")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s.setName("approve")
      .setDescription("Approve a suggestion")
      .addIntegerOption((o) => o.setName("id").setDescription("Suggestion ID").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("reason").setDescription("Optional reason").setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName("deny")
      .setDescription("Deny a suggestion")
      .addIntegerOption((o) => o.setName("id").setDescription("Suggestion ID").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("reason").setDescription("Optional reason").setRequired(false))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub    = interaction.options.getSubcommand() as "approve" | "deny";
  const id     = interaction.options.getInteger("id", true);
  const reason = interaction.options.getString("reason") ?? "";

  const sugg = await getSuggestion(id);
  if (!sugg || sugg.guildId !== interaction.guild.id) {
    await interaction.reply({ content: `❌ Suggestion #${id} not found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sugg.status !== "pending") {
    await interaction.reply({ content: `❌ Suggestion #${id} is already **${sugg.status}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await applySuggestionVerdict(interaction, sugg, sub, reason);
}

export async function applySuggestionVerdict(
  interaction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction | import("discord.js").ModalSubmitInteraction,
  sugg: Awaited<ReturnType<typeof getSuggestion>>,
  verdict: "approve" | "deny",
  reason: string,
) {
  if (!sugg || !interaction.guild) return;

  const updated = await updateSuggestionStatus(
    sugg.id,
    verdict === "approve" ? "approved" : "denied",
    reason,
    interaction.user.id,
    interaction.user.tag,
  );
  if (!updated) return;

  const color  = verdict === "approve" ? THEME.success : THEME.danger;
  const label  = verdict === "approve" ? "✅ Approved" : "❌ Denied";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `💡  Suggestion #${sugg.id}  ·  ${BOT_NAME}` })
    .setDescription(sugg.content)
    .addFields(
      { name: "Submitted by", value: `<@${sugg.userId}> \`${sugg.userTag}\``, inline: true },
      { name: "Status",       value: label,                                    inline: true },
      { name: "Reviewed by",  value: `${interaction.user}`,                   inline: true },
      ...(reason ? [{ name: "Reason", value: reason, inline: false }] : []),
    )
    .setFooter({ text: `Status: ${verdict === "approve" ? "Approved" : "Denied"}  ·  ID: ${sugg.id}` })
    .setTimestamp();

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_approve_btn_${sugg.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`suggest_deny_btn_${sugg.id}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
      .setDisabled(true),
  );

  try {
    const ch = await interaction.guild.channels.fetch(sugg.channelId).catch(() => null);
    if (ch?.isTextBased()) {
      const msg = await (ch as import("discord.js").TextChannel).messages.fetch(sugg.messageId).catch(() => null);
      await msg?.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
    }
  } catch {}

  const replyEmbed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${label} suggestion **#${sugg.id}**${reason ? ` — *${reason}*` : ""}.`);

  if ("replied" in interaction && (interaction.replied || interaction.deferred)) {
    await interaction.followUp({ embeds: [replyEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
  } else if ("update" in interaction) {
    await (interaction as import("discord.js").ButtonInteraction).reply({ embeds: [replyEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [replyEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
