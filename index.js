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
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// STORAGE (simple memory)
// ─────────────────────────────

const welcomeSettings = new Map();
const leaveSettings = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),

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

    // 🏓 ping
    if (interaction.commandName === "ping") {
      return interaction.reply("Pong!");
    }

    // 👋 welcome setup
    if (interaction.commandName === "welcome-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("welcome_enable")
          .setLabel("Enable Welcome")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("welcome_disable")
          .setLabel("Disable")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Welcome System Panel\nClick a button below:",
        components: [row],
        ephemeral: true
      });
    }

    // 👋 goodbye setup
    if (interaction.commandName === "goodbye-setup") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("leave_enable")
          .setLabel("Enable Goodbye")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("leave_disable")
          .setLabel("Disable")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Goodbye System Panel",
        components: [row],
        ephemeral: true
      });
    }
  }

  // ─────────────────────────────
  // BUTTON HANDLING
  // ─────────────────────────────

  if (interaction.isButton()) {
    const guildId = interaction.guild.id;

    // welcome enable
    if (interaction.customId === "welcome_enable") {
      welcomeSettings.set(guildId, {
        channel: interaction.channel.id,
        message: "Welcome {user}!",
        mention: true
      });

      return interaction.reply({ content: "✅ Welcome enabled", ephemeral: true });
    }

    if (interaction.customId === "welcome_disable") {
      welcomeSettings.delete(guildId);
      return interaction.reply({ content: "❌ Welcome disabled", ephemeral: true });
    }

    // leave enable
    if (interaction.customId === "leave_enable") {
      leaveSettings.set(guildId, {
        channel: interaction.channel.id,
        message: "{user} left the server",
        mention: false
      });

      return interaction.reply({ content: "✅ Goodbye enabled", ephemeral: true });
    }

    if (interaction.customId === "leave_disable") {
      leaveSettings.delete(guildId);
      return interaction.reply({ content: "❌ Goodbye disabled", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// MEMBER JOIN (WELCOME)
// ─────────────────────────────

client.on("guildMemberAdd", (member) => {
  const settings = welcomeSettings.get(member.guild.id);
  if (!settings) return;

  const channel = member.guild.channels.cache.get(settings.channel);
  if (!channel) return;

  const text = settings.message.replace("{user}", `<@${member.id}>`);

  const embed = new EmbedBuilder()
    .setTitle("Welcome!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0x57F287);

  channel.send({
    content: settings.mention ? `<@${member.id}>` : null,
    embeds: [embed]
  });
});

// ─────────────────────────────
// MEMBER LEAVE (GOODBYE)
// ─────────────────────────────

client.on("guildMemberRemove", (member) => {
  const settings = leaveSettings.get(member.guild.id);
  if (!settings) return;

  const channel = member.guild.channels.cache.get(settings.channel);
  if (!channel) return;

  const text = settings.message.replace("{user}", member.user.tag);

  const embed = new EmbedBuilder()
    .setTitle("Goodbye!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0xED4245);

  channel.send({ embeds: [embed] });
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
