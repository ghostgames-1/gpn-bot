const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("List commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say something (owner only)")
    .addStringOption(option =>
      option.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("checklink")
    .setDescription("Check a URL")
    .addStringOption(option =>
      option.setName("url")
        .setDescription("Website (example: google.com)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason")
        .setRequired(false)
    )
].map(cmd => cmd.toJSON());

// ─────────────────────────────
// READY + REGISTER
// ─────────────────────────────

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("Slash commands registered");
  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// COMMAND HANDLER
// ─────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {

    // 🏓 ping
    if (interaction.commandName === "ping") {
      return interaction.reply("🏓 Pong!");
    }

    // 📋 help
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("Commands")
        .setColor(0x5865F2)
        .addFields(
          { name: "/ping", value: "Check bot", inline: false },
          { name: "/say", value: "Bot sends message", inline: false },
          { name: "/checklink", value: "Check a URL", inline: false },
          { name: "/ban", value: "Ban a user", inline: false }
        );

      return interaction.reply({ embeds: [embed] });
    }

    // 📢 say
    if (interaction.commandName === "say") {
      if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "Only server owner can use this.", ephemeral: true });
      }

      const msg = interaction.options.getString("message");

      await interaction.reply({ content: "Sent!", ephemeral: true });
      return interaction.channel.send(msg);
    }

    // 🔗 checklink
    if (interaction.commandName === "checklink") {
      const url = interaction.options.getString("url");

      if (!url.includes(".")) {
        return interaction.reply({ content: "Invalid URL.", ephemeral: true });
      }

      return interaction.reply(`🔍 Checked: **${url}**`);
    }

    // 🔨 ban
    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: "No permission.", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason";

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ content: "User not found.", ephemeral: true });
      }

      if (!member.bannable) {
        return interaction.reply({ content: "I can't ban this user.", ephemeral: true });
      }

      await member.ban({ reason });

      return interaction.reply(`🔨 Banned ${user.tag} | ${reason}`);
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error occurred.", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
