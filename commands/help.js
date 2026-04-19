const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Commands"),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Commands")
      .setDescription("/ping, /ban, /tempban, /checklink, /say");

    interaction.reply({ embeds: [embed] });
  }
};
