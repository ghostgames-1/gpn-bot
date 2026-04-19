const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("checklink")
    .setDescription("Check link")
    .addStringOption(o => o.setName("url").setRequired(true)),

  async execute(interaction) {
    const url = interaction.options.getString("url");

    let category = "Safe";
    if (url.includes("game") || url.includes("io")) category = "Games";
    if (url.includes("proxy") || url.includes("vpn")) category = "Proxy";
    if (url.includes("xxx")) category = "Adult";

    const embed = new EmbedBuilder()
      .setTitle("Link Check")
      .setDescription(`URL: ${url}\nCategory: ${category}`);

    interaction.reply({ embeds: [embed] });
  }
};
