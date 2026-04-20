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
const joinTracker = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),

  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message")
    .addStringOption(o =>
      o.setName("message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Temp ban (seconds)")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("seconds").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user (minutes)")
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
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await new Promise(r => setTimeout(r, 2000));

  for (const guild of client.guilds.cache.values()) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands }
    );
  }

  console.log("Commands synced");
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "ping") {
      return interaction.reply("🏓 Pong!");
    }

    if (interaction.commandName === "help") {
      return interaction.reply("/ping /help /say /kick /ban /tempban /timeout /welcome-setup /goodbye-setup");
    }

    if (interaction.commandName === "say") {
      const msg = interaction.options.getString("message");
      return interaction.reply(msg);
    }

    if (interaction.commandName === "kick") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return interaction.reply({ content: "No permission", ephemeral: true });

      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id);
      await member.kick();
      return interaction.reply(`Kicked ${user.tag}`);
    }

    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return interaction.reply({ content: "No permission", ephemeral: true });

      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id);
      await member.ban();
      return interaction.reply(`Banned ${user.tag}`);
    }

    if (interaction.commandName === "tempban") {
      const user = interaction.options.getUser("user");
      const seconds = interaction.options.getInteger("seconds");

      const member = await interaction.guild.members.fetch(user.id);
      await member.ban();

      setTimeout(() => {
        interaction.guild.members.unban(user.id);
      }, seconds * 1000);

      return interaction.reply(`Temp banned ${user.tag}`);
    }

    if (interaction.commandName === "timeout") {
      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");

      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(minutes * 60000);

      return interaction.reply(`Timed out ${user.tag}`);
    }

    // welcome setup
    if (interaction.commandName === "welcome-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("w_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("w_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ content: "Welcome Panel", components: [row], ephemeral: true });
    }

    // goodbye setup
    if (interaction.commandName === "goodbye-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("g_on").setLabel("Enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("g_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ content: "Goodbye Panel", components: [row], ephemeral: true });
    }
  }

  if (interaction.isButton()) {
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
  }
});

// ─────────────────────────────
// JOIN / LEAVE
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const ch = welcomeSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);

  const embed = new EmbedBuilder()
    .setTitle("Welcome!")
    .setDescription(`Welcome <@${member.id}>`)
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({ embeds: [embed] });
});

client.on("guildMemberRemove", member => {
  const ch = leaveSettings.get(member.guild.id);
  if (!ch) return;

  const channel = member.guild.channels.cache.get(ch);

  const embed = new EmbedBuilder()
    .setTitle("Goodbye!")
    .setDescription(`${member.user.tag} left`)
    .setThumbnail(member.user.displayAvatarURL());

  channel.send({ embeds: [embed] });
});

// ─────────────────────────────
// RAID DETECTION
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const now = Date.now();
  const arr = joinTracker.get(member.guild.id) || [];
  arr.push(now);

  const filtered = arr.filter(t => now - t < 10000);
  joinTracker.set(member.guild.id, filtered);

  if (filtered.length >= 5) {
    console.log("RAID DETECTED");
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
