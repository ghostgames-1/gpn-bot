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

const welcomeSettings = new Map();
const leaveSettings = new Map();

// COMMANDS
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("say")
    .addStringOption(o => o.setName("message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder().setName("welcome-setup"),
  new SlashCommandBuilder().setName("goodbye-setup")

].map(c => c.toJSON());

// READY
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  for (const guild of client.guilds.cache.values()) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands }
    );
    console.log(`Synced: ${guild.name}`);
  }
});

// INTERACTIONS
client.on("interactionCreate", async (interaction) => {

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

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "help") {
    return interaction.reply("/ping /help /say /kick /ban /timeout /welcome-setup /goodbye-setup");
  }

  if (interaction.commandName === "say") {
    return interaction.reply(interaction.options.getString("message"));
  }

  if (interaction.commandName === "kick") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: "No permission", ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.options.getUser("user").id);
    await member.kick();
    return interaction.reply("User kicked");
  }

  if (interaction.commandName === "ban") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: "No permission", ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.options.getUser("user").id);
    await member.ban();
    return interaction.reply("User banned");
  }

  if (interaction.commandName === "timeout") {
    const member = await interaction.guild.members.fetch(interaction.options.getUser("user").id);
    const minutes = interaction.options.getInteger("minutes");

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
});

// JOIN / LEAVE
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

// LOGIN
if (!process.env.TOKEN) {
  console.error("❌ TOKEN missing");
  process.exit(1);
}

client.login(process.env.TOKEN);
