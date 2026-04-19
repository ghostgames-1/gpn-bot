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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot check"),
  new SlashCommandBuilder().setName("help").setDescription("Commands list"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user (minutes)")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Duration").setRequired(true)
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
    .setDescription("Temp ban (seconds)")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("seconds").setDescription("Time").setRequired(true)
    )
].map(c => c.toJSON());

// ─────────────────────────────
// RAID / NUKE PROTECTION SETTINGS
// ─────────────────────────────

const joinTracker = new Map(); // raid detection
const RAID_LIMIT = 5; // 5 joins
const RAID_TIME = 10 * 1000; // 10 seconds

// ─────────────────────────────
// READY (GUILD COMMANDS + CLEAN SYNC)
// ─────────────────────────────

client.once("ready", async () => {
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

    console.log("Commands synced");
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
          "/ping\n/help\n/kick\n/timeout\n/ban\n/tempban"
        );

      return interaction.reply({ embeds: [embed] });
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

    // ⏳ timeout
    if (interaction.commandName === "timeout") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.timeout(minutes * 60 * 1000);
      return interaction.reply(`⏳ Timed out ${user.tag} for ${minutes} minutes`);
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
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: "No permission", ephemeral: true });
      }

      const user = interaction.options.getUser("user");
      const seconds = interaction.options.getInteger("seconds");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

      await member.ban();

      setTimeout(async () => {
        try {
          await interaction.guild.members.unban(user.id);
        } catch {}
      }, seconds * 1000);

      return interaction.reply(`⏳ Temp banned ${user.tag} for ${seconds}s`);
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error occurred", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// RAID PROTECTION (JOIN FLOOD)
// ─────────────────────────────

client.on("guildMemberAdd", (member) => {
  const now = Date.now();
  const guildId = member.guild.id;

  if (!joinTracker.has(guildId)) {
    joinTracker.set(guildId, []);
  }

  const joins = joinTracker.get(guildId);
  joins.push(now);

  // remove old joins
  const filtered = joins.filter(t => now - t < RAID_TIME);
  joinTracker.set(guildId, filtered);

  if (filtered.length >= RAID_LIMIT) {
    console.log("RAID DETECTED!");

    member.guild.channels.cache.forEach(channel => {
      if (channel.isTextBased()) {
        channel.send("⚠️ Raid detected! Server is being protected.");
      }
    });

    // optional: lock server (basic protection)
  }
});

// ─────────────────────────────
// NUKE PROTECTION (basic detection)
// ─────────────────────────────

client.on("channelDelete", async (channel) => {
  try {
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: 12 });
    const entry = logs.entries.first();

    if (!entry) return;

    console.log(`Channel deleted by ${entry.executor.tag}`);
  } catch {}
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
