client.on("error", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
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

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcomeSettings = new Map();
const leaveSettings = new Map();
const tempBans = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),

  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send message")
    .addStringOption(o =>
      o.setName("message").setRequired(true).setDescription("Message")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user").setRequired(true).setDescription("User")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temp ban user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("seconds").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("welcome-setup")
    .setDescription("Setup welcome system"),

  new SlashCommandBuilder()
    .setName("goodbye-setup")
    .setDescription("Setup leave system")

].map(c => c.toJSON());

// ─────────────────────────────
// READY + CLEAN REGISTER
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
      return interaction.reply({
        content:
`/ping
/help
/say
/kick
/ban
/tempban
/timeout
/welcome-setup
/goodbye-setup`
      });
    }

    // 📢 say
    if (interaction.commandName === "say") {
      const msg = interaction.options.getString("message");
      return interaction.reply(msg);
    }

    // 👢 kick
    if (interaction.commandName === "kick") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.kick();
      return interaction.reply(`👢 Kicked ${user.tag}`);
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

      await member.ban({ reason });
      return interaction.reply(`🔨 Banned ${user.tag}`);
    }

    // ⏳ tempban
    if (interaction.commandName === "tempban") {
      const user = interaction.options.getUser("user");
      const seconds = interaction.options.getInteger("seconds");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.ban();

      tempBans.set(user.id, Date.now() + seconds * 1000);

      setTimeout(async () => {
        try {
          await interaction.guild.members.unban(user.id);
        } catch {}
      }, seconds * 1000);

      return interaction.reply(`⏳ Temp banned ${user.tag} for ${seconds}s`);
    }

    // ⏳ timeout
    if (interaction.commandName === "timeout") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.timeout(minutes * 60000);

      return interaction.reply(`⏳ Timed out ${user.tag} for ${minutes} minutes`);
    }

    // 👋 welcome panel
    if (interaction.commandName === "welcome-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("w_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("w_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Welcome System",
        components: [row],
        ephemeral: true
      });
    }

    // 👋 goodbye panel
    if (interaction.commandName === "goodbye-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("g_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("g_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Goodbye System",
        components: [row],
        ephemeral: true
      });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error occurred", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// BUTTONS
// ─────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const id = interaction.guild.id;

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
});

// ─────────────────────────────
// JOIN / LEAVE EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const ch = welcomeSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);

  const embed = new EmbedBuilder()
    .setTitle("Welcome!")
    .setDescription(`Welcome <@${member.id}>`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0x57F287);

  channel.send({ embeds: [embed] });
});

client.on("guildMemberRemove", member => {
  const ch = leaveSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);

  const embed = new EmbedBuilder()
    .setTitle("Goodbye!")
    .setDescription(`${member.user.tag} left`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0xED4245);

  channel.send({ embeds: [embed] });
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
