const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Say something")
    .addStringOption(o => o.setName("message").setRequired(true)),
  async execute(interaction) {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: "Owner only.", ephemeral: true });
    }

    const msg = interaction.options.getString("message");
    await interaction.reply({ content: "Sent", ephemeral: true });
    interaction.channel.send(msg);
  }
};
