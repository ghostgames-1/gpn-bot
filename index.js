process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

const welcomeSettings = new Map();
const leaveSettings = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send message")
    .addStringOption(o => o.setName("message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temp ban")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("seconds").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder().setName("welcome-setup").setDescription("Setup welcome"),
  new SlashCommandBuilder().setName("goodbye-setup").setDescription("Setup goodbye")

].map(c => c.toJSON());

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await new Promise(r => setTimeout(r, 2000));

    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`Synced: ${guild.name}`);
    }

  } catch (err) {
    console.error("REGISTER ERROR:", err);
  }
});

// ─────────────────────────────
// SINGLE INTERACTION HANDLER
// ─────────────────────────────

client.on("interactionCreate", async (interaction) => {

  // BUTTONS
  if (interaction.isButton()) {
    const id = interaction.guild?.id;
    if (!id) return;

    if (interaction.customId === "w_on") {
      welcomeSettings.set(id, interaction.channel.id);
      return interaction.reply({ content: "Welcome enabled", ephemeral: true });
    }

    if (interaction.customId === "w_off") {
      welcomeSettings.delete(id);
      return interaction.reply({ content: "Welcome disabled", ephemeral: true });
    }

    if (interaction.customId === "g_on") {
      leaveSettings.set(id, interaction.channel.id);
      return interaction.reply({ content: "Goodbye enabled", ephemeral: true });
    }

    if (interaction.customId === "g_off") {
      leaveSettings.delete(id);
      return interaction.reply({ content: "Goodbye disabled", ephemeral: true });
    }
  }

  // SLASH COMMANDS
  if (!interaction.isChatInputCommand()) return;

  try {

    if (interaction.commandName === "ping") {
      return interaction.reply("🏓 Pong!");
    }

    if (interaction.commandName === "help") {
      return interaction.reply("/ping /help /say /kick /ban /tempban /timeout /welcome-setup /goodbye-setup");
    }

    if (interaction.commandName === "say") {
      return interaction.reply(interaction.options.getString("message"));
    }

    if (interaction.commandName === "kick") {
      if (!interaction.member?.permissions.has(PermissionsBitField.Flags.KickMembers))
        return interaction.reply({ content: "No permission", ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.options.getUser("user").id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.kick();
      return interaction.reply("User kicked");
    }

    if (interaction.commandName === "ban") {
      if (!interaction.member?.permissions.has(PermissionsBitField.Flags.BanMembers))
        return interaction.reply({ content: "No permission", ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.options.getUser("user").id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.ban();
      return interaction.reply("User banned");
    }

    if (interaction.commandName === "tempban") {
      const user = interaction.options.getUser("user");
      const seconds = interaction.options.getInteger("seconds");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.ban();

      setTimeout(() => {
        interaction.guild.members.unban(user.id).catch(() => {});
      }, seconds * 1000);

      return interaction.reply(`Temp banned for ${seconds}s`);
    }

    if (interaction.commandName === "timeout") {
      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.timeout(minutes * 60000);
      return interaction.reply(`Timed out for ${minutes} minutes`);
    }

    if (interaction.commandName === "welcome-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("w_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("w_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ content: "Welcome Panel", components: [row], ephemeral: true });
    }

    if (interaction.commandName === "goodbye-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("g_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("g_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ content: "Goodbye Panel", components: [row], ephemeral: true });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error occurred", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// JOIN / LEAVE
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const ch = welcomeSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);
  if (!channel) return;

  channel.send(`Welcome <@${member.id}>`).catch(() => {});
});

client.on("guildMemberRemove", member => {
  const ch = leaveSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);
  if (!channel) return;

  channel.send(`${member.user.tag} left`).catch(() => {});
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("❌ TOKEN missing");
  process.exit(1);
}

client.login(process.env.TOKEN);
