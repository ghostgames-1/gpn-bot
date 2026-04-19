process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

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
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot sends message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
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
      o.setName("seconds").setDescription("Duration").setRequired(true)
    )
].map(c => c.toJSON());

// ─────────────────────────────
// READY + SAFE GUILD COMMAND REG
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // wait for guild cache to fully load
    await new Promise(r => setTimeout(r, 2000));

    const guilds = client.guilds.cache;

    if (!guilds || guilds.size === 0) {
      console.log("No guilds found yet, skipping registration");
      return;
    }

    for (const guild of guilds.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );

      console.log(`Commands registered in: ${guild.name}`);
    }

    console.log("All commands registered successfully");
  } catch (err) {
    console.error("Command registration error:", err);
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
        .setDescription("/ping\n/help\n/say\n/ban\n/tempban");

      return interaction.reply({ embeds: [embed] });
    }

    // 📢 say
    if (interaction.commandName === "say") {
      if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "Owner only command", ephemeral: true });
      }

      const msg = interaction.options.getString("message");

      await interaction.reply({ content: "Sent!", ephemeral: true });
      return interaction.channel.send(msg);
    }

    // 🔨 ban
    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason";

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ content: "User not found", ephemeral: true });
      }

      if (!member.bannable) {
        return interaction.reply({ content: "I can't ban this user", ephemeral: true });
      }

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

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ content: "User not found", ephemeral: true });
      }

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
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
