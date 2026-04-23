const fs = require("fs");
const https = require("https");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
  PermissionsBitField
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// DATABASE (WARNS)
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
// FILTER DATABASE
// ─────────────────────────────

const filters = {
  FortiGuard: ["fortiguard", "fortinet"],
  GoGuardian: ["goguardian"],
  Lightspeed: ["lightspeed", "relay.school"],
  Securly: ["securly"],
  Blocksi: ["blocksi"],
  Linewize: ["linewize", "familyzone"],
  ContentKeeper: ["contentkeeper"]
};

// ─────────────────────────────
// STATUS (WATCHING SERVERS LIVE)
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers`,
      type: ActivityType.Watching
    }],
    status: "online"
  });
}

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping bot"),
  new SlashCommandBuilder().setName("help").setDescription("📋 Help menu"),
  new SlashCommandBuilder().setName("about").setDescription("🤖 Bot info"),
  new SlashCommandBuilder().setName("analytics").setDescription("📊 Server stats"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Send message")
    .addStringOption(o =>
      o.setName("message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("🌐 Check website against filters")
    .addStringOption(o =>
      o.setName("url").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠ Warn user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (SAFE GUILD ONLY)
// ─────────────────────────────

async function registerCommands() {
  try {
    if (!client.user) return;

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    const guilds = await client.guilds.fetch().catch(() => null);
    if (!guilds) return;

    for (const [, guild] of guilds) {
      if (!guild?.id) continue;

      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
    }

    console.log("✅ Guild commands synced");
  } catch (err) {
    console.error("REGISTER ERROR:", err);
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();

  setInterval(updateStatus, 15000);

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // ───────── BASIC ─────────

  if (commandName === "ping")
    return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

  if (commandName === "help")
    return i.reply({
      embeds: [embed("Help", 0x3498db, [
        { name: "Commands", value: "/ping /help /about /analytics /say /checkall /kick /ban /timeout /warn /warnings" }
      ])]
    });

  if (commandName === "about")
    return i.reply({
      embeds: [embed("About Bot", 0x9b59b6, [
        { name: "Servers Watching", value: `${client.guilds.cache.size}` },
        { name: "Status", value: "Online 👀" }
      ])]
    });

  if (commandName === "analytics")
    return i.reply({
      embeds: [embed("Analytics", 0x1abc9c, [
        { name: "Servers", value: `${client.guilds.cache.size}` }
      ])]
    });

  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply({ embeds: [embed("Sent", 0x2ecc71)] });
  }

  // ───────── CHECKALL (FIXED SAFE VERSION) ─────────

  if (commandName === "checkall") {
    await i.deferReply();

    let url = i.options.getString("url");
    if (!url) return i.editReply("No URL");

    if (!url.startsWith("http")) url = "https://" + url;

    let results = [];

    try {
      const res = await new Promise(resolve => {
        https.get(url, r => resolve(r))
          .on("error", () => resolve(null));
      });

      if (!res) {
        return i.editReply({
          embeds: [embed("CHECKALL", 0xe74c3c, [
            { name: "Result", value: "Unreachable / Blocked" }
          ])]
        });
      }

      let text = "";

      try {
        text = await res.text?.() || "";
      } catch {
        text = "";
      }

      const lower = text.toLowerCase();

      for (const [name, sigs] of Object.entries(filters)) {
        const hit = sigs.some(s => lower.includes(s));
        results.push(hit ? `❌ ${name}` : `✔ ${name}`);
      }

      return i.editReply({
        embeds: [embed("CHECKALL", 0x2ecc71, [
          { name: "URL", value: url },
          { name: "Filters", value: results.join("\n") }
        ])]
      });

    } catch (err) {
      console.error(err);
      return i.editReply("Error running check");
    }
  }

  // ───────── MODERATION ─────────

  async function mod(type) {
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
      embeds: [embed(type.toUpperCase(), 0xe67e22, [
        { name: "User", value: user.tag },
        { name: "Reason", value: reason }
      ])]
    });
  }

  if (commandName === "kick") return mod("kick");
  if (commandName === "ban") return mod("ban");
  if (commandName === "timeout") return mod("timeout");

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
      embeds: [embed("Warnings", 0x3498db, [
        { name: user.tag, value: list.join("\n") || "None" }
      ])]
    });
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
