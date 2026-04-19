const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temp ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("seconds").setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: "No permission", ephemeral: true });
    }

    const user = interaction.options.getUser("user");
    const seconds = interaction.options.getInteger("seconds");

    const member = await interaction.guild.members.fetch(user.id);
    await member.ban();

    interaction.reply(`Temp banned ${user.tag} for ${seconds}s`);

    setTimeout(async () => {
      await interaction.guild.members.unban(user.id);
    }, seconds * 1000);
  }
};
