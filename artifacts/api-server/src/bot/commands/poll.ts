import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { THEME } from "../theme.js";

const OPTION_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Create a reaction poll in this channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) => o.setName("question").setDescription("The poll question").setRequired(true))
  .addStringOption((o) => o.setName("option1").setDescription("Option 1").setRequired(true))
  .addStringOption((o) => o.setName("option2").setDescription("Option 2").setRequired(true))
  .addStringOption((o) => o.setName("option3").setDescription("Option 3 (optional)").setRequired(false))
  .addStringOption((o) => o.setName("option4").setDescription("Option 4 (optional)").setRequired(false))
  .addStringOption((o) => o.setName("option5").setDescription("Option 5 (optional)").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true);

  const options: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const opt = interaction.options.getString(`option${i}`);
    if (opt) options.push(opt);
  }

  const embed = new EmbedBuilder()
    .setColor(THEME.info)
    .setTitle(`📊 // ${question}`)
    .setDescription(
      options.map((opt, i) => `${OPTION_EMOJIS[i]} **${opt}**`).join("\n\n")
    )
    .setFooter({ text: `Poll by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const msg = await interaction.fetchReply();
  for (let i = 0; i < options.length; i++) {
    await msg.react(OPTION_EMOJIS[i]!).catch(() => {});
  }
}
