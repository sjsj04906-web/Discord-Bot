import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, type ChatInputCommandInteraction,
} from "discord.js";
import { THEME, BOT_NAME } from "../theme.js";
import { getGuildConfig, getBalance, deductBalance, getShopItems, addShopItem, removeShopItem } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Server shop")
  .addSubcommand((s) =>
    s.setName("list").setDescription("Browse the shop")
  )
  .addSubcommand((s) =>
    s.setName("buy")
      .setDescription("Buy an item from the shop")
      .addIntegerOption((o) => o.setName("id").setDescription("Item ID").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s.setName("add")
      .setDescription("Add a role reward to the shop (admin)")
      .addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true))
      .addIntegerOption((o) => o.setName("price").setDescription("Price in coins").setRequired(true).setMinValue(1))
      .addRoleOption((o) => o.setName("role").setDescription("Role to grant (optional)").setRequired(false))
      .addStringOption((o) => o.setName("description").setDescription("Item description").setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName("remove")
      .setDescription("Remove a shop item (admin)")
      .addIntegerOption((o) => o.setName("id").setDescription("Item ID").setRequired(true).setMinValue(1))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();
  const config = await getGuildConfig(interaction.guild.id);
  const em = config.currencyEmoji;

  if (sub === "list") {
    const items = await getShopItems(interaction.guild.id);
    if (items.length === 0) {
      await interaction.reply({ content: "The shop is empty. Admins can add items with `/shop add`.", ephemeral: true });
      return;
    }
    const lines = items.map((it) =>
      `**#${it.id}** — ${it.name}  •  **${it.price.toLocaleString()} ${em}**${it.description ? `\n> ${it.description}` : ""}${it.roleId ? `\n> Grants: <@&${it.roleId}>` : ""}`
    );
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setAuthor({ name: `🛒  Server Shop  ·  ${BOT_NAME}` })
          .setDescription(lines.join("\n\n"))
          .setFooter({ text: `Use /shop buy <id> to purchase` })
          .setTimestamp(),
      ],
    });
    return;
  }

  if (sub === "buy") {
    const itemId = interaction.options.getInteger("id", true);
    const items  = await getShopItems(interaction.guild.id);
    const item   = items.find((i) => i.id === itemId);

    if (!item) {
      await interaction.reply({ content: `Item #${itemId} not found.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const eco = await getBalance(interaction.guild.id, interaction.user.id);
    if (eco.balance < item.price) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.danger)
            .setDescription(`❌ You need **${item.price.toLocaleString()} ${em}** but only have **${eco.balance.toLocaleString()} ${em}**.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await deductBalance(interaction.guild.id, interaction.user.id, item.price);

    if (item.roleId) {
      const member = interaction.guild.members.cache.get(interaction.user.id)
        ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      await member?.roles.add(item.roleId, `Bought from shop: ${item.name}`).catch(() => {});
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setAuthor({ name: `🛒  Purchase Complete  ·  ${BOT_NAME}` })
          .setDescription(`You bought **${item.name}** for **${item.price.toLocaleString()} ${em}**!${item.roleId ? `\n\n<@&${item.roleId}> has been granted to you.` : ""}`)
          .addFields({ name: "New Balance", value: `${(eco.balance - item.price).toLocaleString()} ${em}`, inline: true }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.guild.ownerId === interaction.user.id;
  if (!isAdmin) {
    await interaction.reply({ content: "You need **Manage Server** to do that.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "add") {
    const name  = interaction.options.getString("name", true);
    const price = interaction.options.getInteger("price", true);
    const role  = interaction.options.getRole("role");
    const desc  = interaction.options.getString("description") ?? "";
    const id    = await addShopItem(interaction.guild.id, name, desc, price, role?.id ?? "");
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription(`✅ Added **${name}** (ID: \`${id}\`) for **${price.toLocaleString()} ${em}**.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    const id = interaction.options.getInteger("id", true);
    const ok = await removeShopItem(id, interaction.guild.id);
    await interaction.reply({
      content: ok ? `✅ Item #${id} removed.` : `❌ Item #${id} not found.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
