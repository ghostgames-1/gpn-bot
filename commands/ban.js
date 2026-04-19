const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: "No permission", ephemeral: true });
    }

    const user = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(user.id);

    await member.ban();
    interaction.reply(`Banned ${user.tag}`);
  }
};
