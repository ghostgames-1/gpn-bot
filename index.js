const fs = require("fs");
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

// ───────── SAFE CRASH HANDLERS ─────────

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── CLIENT ─────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ───────── SAFE JSON LOADER (FIXES RAILWAY CRASHES) ─────────

function loadJSON(path) {
  try {
    if (!fs.existsSync(path)) return {};
    const data = fs.readFileSync(path, "utf8");
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

const CONFIG_FILE = "./config.json";
const WARN_FILE = "./warns.json";

let config = loadJSON(CONFIG_FILE);
let warns = loadJSON(WARN_FILE);

let served = 0;

const saveConfig = () =>
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

const saveWarns = () =>
  fs.writeFileSync(WARN_FILE, JSON.stringify(warns, null, 2));

// ───────── GUILD CONFIG ─────────

function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      whitelist: [],
      logChannel: null,
      linkBlock: true
    };
  }
  return config[id];
}

// ───────── EMBED ─────────

function embed(title, color, fields = []) {
  const e = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (fields.length) e.addFields(fields);
  return e;
}

// ───────── SAFE HELPERS ─────────

function getUser(i, name) {
  return i.options.getUser(name) || null;
}

function getRole(i, name) {
  return i.options.getRole(name) || null;
}

async function resolveMember(guild, user) {
  if (!guild || !user) return null;
  return await guild.members.fetch(user.id).catch(() => null);
}

async function safeReply(i, data) {
  try {
    if (i.replied || i.deferred) return i.followUp(data);
    return i.reply(data);
  } catch (e) {
    console.error(e);
  }
}

// ───────── STATUS ─────────

function updateStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers | ${served} served`,
      type: ActivityType.Watching
    }],
    status: "online"
  });
}

// ───────── COMMANDS (FULLY FIXED - NO UNDEFINED ERRORS) ─────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as the bot")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8ball")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to kick")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to timeout")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Duration in minutes")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to warn")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages (1-100)")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ───────── READY ─────────

client.once("ready", async () => {
  if (!process.env.TOKEN) {
    console.error("❌ Missing TOKEN in env");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  updateStatus();
  setInterval(updateStatus, 15000);

  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ───────── INTERACTIONS (SAFE CORE) ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const start = Date.now();

  try {
    if (!i.guild)
      return safeReply(i, { content: "❌ Guild only", ephemeral: true });

    served++;

    const guild = i.guild;
    const member = await guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return;

    const g = getGuild(guild.id);

    // ───────── PING ─────────
    if (i.commandName === "ping") {
      const api = client.ws.ping;
      const ms = Date.now() - start;

      return safeReply(i, {
        embeds: [embed("🏓 Pong", 0x2ecc71, [
          { name: "API Latency", value: `${api}ms`, inline: true },
          { name: "Response Time", value: `${ms}ms`, inline: true }
        ])]
      });
    }

    // ───────── SAY ─────────
    if (i.commandName === "say") {
      const msg = i.options.getString("message");

      await i.channel.send(msg).catch(() => {});
      return safeReply(i, {
        embeds: [embed("✅ Sent", 0x2ecc71)],
        ephemeral: true
      });
    }

    // ───────── 8BALL ─────────
    if (i.commandName === "8ball") {
      const q = i.options.getString("question");

      const answers = [
        "Yes", "No", "Maybe", "Definitely",
        "Ask again later", "Highly unlikely",
        "Without a doubt"
      ];

      const a = answers[Math.floor(Math.random() * answers.length)];

      return safeReply(i, {
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Question", value: q },
          { name: "Answer", value: a }
        ])]
      });
    }

    // ───────── WARN ─────────
    if (i.commandName === "warn") {
      const u = getUser(i, "user");
      const r = i.options.getString("reason");

      if (!u || !r)
        return safeReply(i, { content: "❌ Invalid input", ephemeral: true });

      warns[u.id] ??= [];
      warns[u.id].push(r);
      saveWarns();

      return safeReply(i, {
        embeds: [embed("⚠ Warned", 0xf1c40f)]
      });
    }

    // ───────── WARNINGS ─────────
    if (i.commandName === "warnings") {
      const u = getUser(i, "user");

      return safeReply(i, {
        embeds: [embed("📊 Warnings", 0x3498db, [
          { name: u.tag, value: warns[u.id]?.join("\n") || "None" }
        ])]
      });
    }

    // ───────── PURGE ─────────
    if (i.commandName === "purge") {
      const amount = i.options.getInteger("amount");

      if (amount < 1 || amount > 100)
        return safeReply(i, { content: "❌ 1-100 only", ephemeral: true });

      await i.channel.bulkDelete(amount, true).catch(() => {});
      return safeReply(i, {
        embeds: [embed("🧹 Purged", 0xe67e22)],
        ephemeral: true
      });
    }

  } catch (err) {
    console.error(err);
    return safeReply(i, { content: "❌ Error occurred", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
