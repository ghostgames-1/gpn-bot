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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),

  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot sends message")
    .addStringOption(o =>
      o.setName("message").setDescription("Text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("checklink")
    .setDescription("Check URL")
    .addStringOption(o =>
      o.setName("url").setDescription("Website").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temp ban user (seconds)")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("seconds").setDescription("Time").setRequired(true)
    )
].map(c => c.toJSON());

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
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
// INTERACTIONS
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
        .setDescription(
          "/ping /help /say /checklink /ban /tempban"
        );

      return interaction.reply({ embeds: [embed] });
    }

    // 📢 say
    if (interaction.commandName === "say") {
      if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "Owner only", ephemeral: true });
      }

      const msg = interaction.options.getString("message");
      await interaction.reply({ content: "Sent", ephemeral: true });
      return interaction.channel.send(msg);
    }

    // 🔗 checklink (simple filter system)
    if (interaction.commandName === "checklink") {
      const url = interaction.options.getString("url");

      let category = "Safe";

      if (url.includes("game") || url.includes("io")) category = "Games";
      if (url.includes("proxy") || url.includes("vpn")) category = "Proxy";
      if (url.includes("xxx") || url.includes("porn")) category = "Adult";

      return interaction.reply(`🔍 ${url} → **${category}**`);
    }

    // 🔨 ban
    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason";

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });
      if (!member.bannable) return interaction.reply({ content: "Can't ban this user", ephemeral: true });

      await member.ban({ reason });
      return interaction.reply(`🔨 Banned ${user.tag}`);
    }

    // ⏳ tempban
    if (interaction.commandName === "tempban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const seconds = interaction.options.getInteger("seconds");

      const member = await interaction.guild.members.fetch(user.id);

      await member.ban();
      await interaction.reply(`⏳ Temp banned ${user.tag} for ${seconds}s`);

      setTimeout(async () => {
        try {
          await interaction.guild.members.unban(user.id);
        } catch {}
      }, seconds * 1000);
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error occurred", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// AUTO MODERATION
// ─────────────────────────────

const badWords = ["badword1", "badword2"];

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (badWords.some(w => message.content.toLowerCase().includes(w))) {
    message.delete();
    message.channel.send(`${message.author}, no bad words.`);
  }

  if (message.content.includes("http")) {
    message.delete();
    message.channel.send(`${message.author}, links are not allowed.`);
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
