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
  PermissionsBitField,
  ActivityType
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// WARN DATABASE
// ─────────────────────────────

const DB_FILE = "./warns.json";
let warns = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ─────────────────────────────
// EMBED HELPER
// ─────────────────────────────

function embed(title, color, fields = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();
}

// ─────────────────────────────
// FILTER SIGNATURES (CHECKLINK)
// ─────────────────────────────

const filters = {
  fortiguard: ["fortiguard", "fortinet"],
  goguardian: ["goguardian"],
  lightspeed: ["lightspeed", "relay.school"],
  securly: ["securly"],
  blocksi: ["blocksi"],
  linewize: ["linewize", "familyzone"],
  contentkeeper: ["contentkeeper"]
};

// ─────────────────────────────
// STATUS LIVE WATCHING SERVERS
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [
      {
        name: `${client.guilds.cache.size} servers`,
        type: ActivityType.Watching
      }
    ],
    status: "online"
  });
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),
  new SlashCommandBuilder().setName("about").setDescription("Bot info"),
  new SlashCommandBuilder().setName("analytics").setDescription("Server stats"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send message")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("checklink")
    .setDescription("Check website accessibility + filter detection")
    .addStringOption(o =>
      o.setName("url")
        .setDescription("Website URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
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
    .setName("timeout")
    .setDescription("Timeout a user")
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
    .setDescription("Warn a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER COMMANDS (GUILD ONLY SAFE)
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await client.application.fetch();

  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    await rest.put(
      Routes.applicationGuildCommands(client.application.id, guild.id),
      { body: commands }
    );
  }

  console.log("✅ Commands synced (guild only)");
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);

  setInterval(updateStatus, 15000); // live count update
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // ───────── BASIC ─────────

  if (commandName === "ping") {
    return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });
  }

  if (commandName === "help") {
    return i.reply({
      embeds: [
        embed("Help", 0x3498db, [
          { name: "Commands", value: "/ping /help /about /analytics /say /checklink /kick /ban /timeout /warn /warnings" }
        ])
      ]
    });
  }

  if (commandName === "about") {
    return i.reply({
      embeds: [
        embed("About Bot", 0x9b59b6, [
          { name: "Servers Watching", value: `${client.guilds.cache.size}` },
          { name: "Status", value: "Live monitoring enabled 👀" }
        ])
      ]
    });
  }

  if (commandName === "analytics") {
    return i.reply({
      embeds: [
        embed("Analytics", 0x1abc9c, [
          { name: "Servers", value: `${client.guilds.cache.size}` }
        ])
      ]
    });
  }

  // ───────── SAY ─────────

  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply({ embeds: [embed("Sent", 0x2ecc71)] });
  }

  // ───────── CHECKLINK ─────────

  if (commandName === "checklink") {
    await i.deferReply();

    let url = i.options.getString("url");
    if (!url.startsWith("http")) url = "https://" + url;

    let result = "Unknown";
    let color = 0x3498db;
    let detected = "None";

    try {
      const res = await fetch(url);
      const text = await res.text().catch(() => "");
      const lower = text.toLowerCase();

      for (const [name, sigs] of Object.entries(filters)) {
        if (sigs.some(s => lower.includes(s))) {
          detected = name;
          result = "⚠ Filter Detected";
          color = 0xf1c40f;
          break;
        }
      }

      if (res.ok && detected === "None") {
        result = "✅ Reachable";
        color = 0x2ecc71;
      } else if (!res.ok) {
        result = `❌ Blocked (HTTP ${res.status})`;
        color = 0xe74c3c;
      }

    } catch {
      result = "❌ Unreachable";
      color = 0xe74c3c;
    }

    return i.editReply({
      embeds: [
        embed("Website Check", color, [
          { name: "URL", value: url },
          { name: "Result", value: result },
          { name: "Detected Filter", value: detected }
        ])
      ]
    });
  }

  // ───────── MODERATION ─────────

  async function modAction(type) {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason") || "No reason";
    const member = await guild.members.fetch(user.id);

    if (type === "kick") await member.kick(reason);
    if (type === "ban") await member.ban({ reason });
    if (type === "timeout") {
      const mins = i.options.getInteger("minutes");
      await member.timeout(mins * 60000, reason);
    }

    return i.editReply({
      embeds: [
        embed(`${type.toUpperCase()} DONE`, 0xe67e22, [
          { name: "User", value: user.tag },
          { name: "Reason", value: reason }
        ])
      ]
    });
  }

  if (commandName === "kick") return modAction("kick");
  if (commandName === "ban") return modAction("ban");
  if (commandName === "timeout") return modAction("timeout");

  // ───────── WARN SYSTEM ─────────

  if (commandName === "warn") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns[user.id]) warns[user.id] = [];
    warns[user.id].push(reason);
    saveDB();

    return i.editReply({
      embeds: [embed("Warned", 0xf1c40f, [
        { name: "User", value: user.tag },
        { name: "Reason", value: reason }
      ])]
    });
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns[user.id] || [];

    return i.reply({
      embeds: [
        embed("Warnings", 0x3498db, [
          { name: user.tag, value: list.join("\n") || "None" }
        ])
      ]
    });
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
