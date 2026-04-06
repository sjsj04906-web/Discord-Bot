import {
  SlashCommandBuilder, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getAutoResponders, addAutoResponder, removeAutoResponder } from "../db.js";

const MATCH_TYPES = ["contains", "exact", "startswith"] as const;
type MatchType = typeof MATCH_TYPES[number];

const MATCH_LABELS: Record<MatchType, string> = {
  contains:   "Contains",
  exact:      "Exact",
  startswith: "Starts with",
};

export const data = new SlashCommandBuilder()
  .setName("autoresponder")
  .setDescription("Manage automatic keyword responses")
  .setDefaultMemberPermissions(0x0000000000000008) // ADMINISTRATOR
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
      .setDescription("List all auto-responses for this server")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const trigger   = interaction.options.getString("trigger", true).toLowerCase();
    const response  = interaction.options.getString("response", true);
    const matchType = (interaction.options.getString("match") ?? "contains") as MatchType;

    if (trigger.length > 100) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Trigger must be 100 characters or fewer.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (response.length > 2000) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Response must be 2000 characters or fewer.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = await getAutoResponders(interaction.guild.id);
    if (existing.length >= 50) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Maximum of 50 auto-responders per server.")], flags: MessageFlags.Ephemeral });
      return;
    }

    await addAutoResponder(interaction.guild.id, trigger, response, matchType);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🤖  Auto-Responder Added  ·  ${BOT_NAME}` })
          .addFields(
            { name: "Trigger",  value: `\`${trigger}\``,              inline: true },
            { name: "Match",    value: MATCH_LABELS[matchType],        inline: true },
            { name: "Response", value: response.slice(0, 1024),        inline: false },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    const trigger = interaction.options.getString("trigger", true).toLowerCase();
    const removed = await removeAutoResponder(interaction.guild.id, trigger);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? THEME.success : THEME.danger)
          .setDescription(removed
            ? `✅ Removed auto-responder for \`${trigger}\`.`
            : `❌ No auto-responder found for \`${trigger}\`.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "list") {
    const responders = await getAutoResponders(interaction.guild.id);

    if (responders.length === 0) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.muted).setDescription("No auto-responders configured yet.")],
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
          .setColor(THEME.info)
          .setAuthor({ name: `🤖  Auto-Responders  ·  ${BOT_NAME}` })
          .setDescription(lines.join("\n\n"))
          .setFooter({ text: `${responders.length} / 50 slots used` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
