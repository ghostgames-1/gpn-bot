const COMMANDS = [
    /** previous commands **/
    'ban',  // Command to ban a user
];

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'ban') {
        const userToBan = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';

        // Check if the user is the server owner
        if (interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: 'You do not have permission to ban members.', ephemeral: true });
        }

        // Ban the user from the server
        try {
            await interaction.guild.members.ban(userToBan, { reason });
            await interaction.reply({ content: `${userToBan.tag} has been banned. Reason: ${reason}` });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'An error occurred while trying to ban this user.', ephemeral: true });
        }
    }
});