process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcomeSettings = new Map();
const leaveSettings = new Map();

// ─────────────────────────────
// COMMANDS (CLEAN + FIXED)
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("welcome-setup")
    .setDescription("Setup welcome system"),

  new SlashCommandBuilder()
    .setName("goodbye-setup")
    .setDescription("Setup goodbye system")
].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER COMMANDS (FIXED FOR DUPLICATES)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // IMPORTANT FIX: clear old commands FIRST
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );

    // register fresh commands
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("Slash commands synced cleanly");
  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// INTERACTIONS
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

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ── ping
  if (commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  // ── help
  if (commandName === "help") {
    return interaction.reply("/ping /help /say /kick /ban /timeout /welcome-setup /goodbye-setup");
  }

  // ── say
  if (commandName === "say") {
    const msg = interaction.options.getString("message");
    return interaction.reply(msg);
  }

  // ── kick
  if (commandName === "kick") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: "No permission", ephemeral: true });

    const user = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply("User not found");

    await member.kick();
    return interaction.reply("User kicked");
  }

  // ── ban
  if (commandName === "ban") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: "No permission", ephemeral: true });

    const user = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply("User not found");

    await member.ban();
    return interaction.reply("User banned");
  }

  // ── timeout
  if (commandName === "timeout") {
    const user = interaction.options.getUser("user");
    const minutes = interaction.options.getInteger("minutes");

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply("User not found");

    await member.timeout(minutes * 60000);
    return interaction.reply(`Timed out ${minutes} minutes`);
  }

  // ── welcome panel
  if (commandName === "welcome-setup") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("w_on").setLabel("Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("w_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ content: "Welcome system", components: [row], ephemeral: true });
  }

  // ── goodbye panel
  if (commandName === "goodbye-setup") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("g_on").setLabel("Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("g_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ content: "Goodbye system", components: [row], ephemeral: true });
  }
});

// ─────────────────────────────
// EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const ch = welcomeSettings.get(member.guild.id);
  if (!ch) return;
  member.guild.channels.cache.get(ch)?.send(`Welcome <@${member.id}>`);
});

client.on("guildMemberRemove", member => {
  const ch = leaveSettings.get(member.guild.id);
  if (!ch) return;
  member.guild.channels.cache.get(ch)?.send(`${member.user.tag} left`);
});

// ─────────────────────────────
// LOGIN SAFETY
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
