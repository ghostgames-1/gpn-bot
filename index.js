const fs = require("fs");

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

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// DATABASE (WARN STORAGE)
// ─────────────────────────────

const DB_FILE = "./warns.json";

let warns = {};

if (fs.existsSync(DB_FILE)) {
  warns = JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ─────────────────────────────
// ANTI RAID / NUKE SYSTEM
// ─────────────────────────────

const joinTracker = new Map();

const ANTI_RAID_LIMIT = 5; // joins
const ANTI_RAID_WINDOW = 10000; // 10 sec

let antiRaidEnabled = true;

// ─────────────────────────────
// EMBED
// ─────────────────────────────

function modEmbed(title, color, user, reason) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Reason", value: reason || "No reason provided" }
    )
    .setTimestamp();
}

// ─────────────────────────────
// STATUS
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setActivity(
    `${client.guilds.cache.size} servers`,
    { type: 3 }
  );
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping bot"),
  new SlashCommandBuilder().setName("help").setDescription("📋 Help menu"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Send message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠ Warn user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("📊 Server stats"),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("🎱 Ask question")
    .addStringOption(o =>
      o.setName("question").setDescription("Question").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    await rest.put(
      Routes.applicationGuildCommands(client.application.id, guild.id),
      { body: commands }
    );

    console.log(`✅ Synced ${guild.id}`);
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await client.application.fetch();

  await registerCommands();

  updateStatus();

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);
});

// ─────────────────────────────
// ANTI RAID SYSTEM
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  if (!antiRaidEnabled) return;

  const now = Date.now();
  const guildId = member.guild.id;

  if (!joinTracker.has(guildId)) joinTracker.set(guildId, []);

  const joins = joinTracker.get(guildId);

  joins.push(now);

  const recent = joins.filter(t => now - t < ANTI_RAID_WINDOW);

  joinTracker.set(guildId, recent);

  if (recent.length >= ANTI_RAID_LIMIT) {
    member.guild.channels.cache.forEach(ch => {
      if (ch.permissionsFor(member.guild.members.me)?.has("SendMessages")) {
        ch.send("🛡 Anti-raid triggered: mass joins detected");
      }
    });

    antiRaidEnabled = false;

    setTimeout(() => antiRaidEnabled = true, 30000);
  }
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // 🏓 PING
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // 📢 SAY
  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply("✅ Sent");
  }

  // 👢 KICK
  if (commandName === "kick") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";

      const m = await guild.members.fetch(user.id);
      await m.kick(reason);

      return i.editReply({ embeds: [modEmbed("Kicked", 0xffa500, user, reason)] });

    } catch (e) {
      console.error(e);
      return i.editReply("❌ Failed kick");
    }
  }

  // 🔨 BAN
  if (commandName === "ban") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";

      const m = await guild.members.fetch(user.id);
      await m.ban({ reason });

      return i.editReply({ embeds: [modEmbed("Banned", 0xff0000, user, reason)] });

    } catch (e) {
      console.error(e);
      return i.editReply("❌ Failed ban");
    }
  }

  // ⏳ TIMEOUT
  if (commandName === "timeout") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");
      const reason = i.options.getString("reason") || "No reason";

      const m = await guild.members.fetch(user.id);
      await m.timeout(mins * 60000, reason);

      return i.editReply("⏳ Timed out");

    } catch (e) {
      console.error(e);
      return i.editReply("❌ Failed timeout");
    }
  }

  // ⚠ WARN (DB)
  if (commandName === "warn") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns[user.id]) warns[user.id] = [];
    warns[user.id].push(reason);

    saveDB();

    return i.editReply({ embeds: [modEmbed("Warned", 0xffff00, user, reason)] });
  }

  // 📊 WARNINGS
  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns[user.id] || [];

    return i.reply(list.length ? list.join("\n") : "No warnings");
  }

  // 📊 ANALYTICS
  if (commandName === "analytics") {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📊 Server Analytics")
          .setColor(0x3498db)
          .addFields(
            { name: "Servers", value: `${client.guilds.cache.size}` },
            { name: "Users", value: `${client.users.cache.size}` }
          )
      ]
    });
  }

  // 🎱 8BALL
  if (commandName === "8ball") {
    const answers = ["Yes", "No", "Maybe", "Absolutely", "Never"];
    return i.reply(answers[Math.floor(Math.random() * answers.length)]);
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
