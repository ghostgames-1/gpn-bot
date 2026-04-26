const fs = require("fs");
const https = require("https");
const dns = require("dns").promises;

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

// ───────── CLIENT ─────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ───────── DATABASE ─────────

const DB_FILE = "./warns.json";
let warns = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ───────── EMBED ─────────

function embed(title, color, fields = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();
}

// ───────── STATUS ─────────

function updateStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers`,
      type: ActivityType.Watching
    }]
  });
}

// ───────── SAFE FETCH ─────────

function fetchURL(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    }).on("error", () => resolve(null));
  });
}

// ───────── CHECKS ─────────

async function checkForti(domain) {
  try {
    const url = `https://api.allorigins.win/raw?url=https://fortiguard.com/webfilter?q=${domain}`;
    const data = await fetchURL(url);

    if (!data) return { status: "⚠", category: "Error" };

    const status = data.toLowerCase().includes("block") ? "❌" : "✔";

    return { status, category: "FortiGuard" };
  } catch {
    return { status: "⚠", category: "Error" };
  }
}

async function checkDNS(domain) {
  try {
    const res = await dns.lookup(domain);

    if (!res || !res.address)
      return { status: "❌", category: "No Resolve" };

    return { status: "✔", category: res.address };
  } catch {
    return { status: "❌", category: "DNS Blocked" };
  }
}

function classify(domain) {
  domain = domain.toLowerCase();

  if (domain.includes("proxy") || domain.includes("vpn"))
    return { status: "❌", category: "Proxy" };

  if (domain.includes("game"))
    return { status: "❌", category: "Games" };

  return { status: "✔", category: "General" };
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("Scan a website")
    .addStringOption(o =>
      o.setName("url")
        .setDescription("Website URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Owner only message")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to kick")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
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
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
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
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ───────── REGISTER ─────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await client.application.fetch();

  await rest.put(
    Routes.applicationCommands(client.application.id),
    { body: commands }
  );

  console.log("Commands registered");
}

// ───────── READY ─────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const cmd = i.commandName;

  try {

    if (cmd === "ping")
      return i.reply("🏓 Pong");

    if (cmd === "help")
      return i.reply("Use slash commands");

    if (cmd === "say") {
      if (i.guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      await i.channel.send(i.options.getString("message"));
      return i.reply({ content: "Sent", ephemeral: true });
    }

    if (cmd === "checkall") {
      await i.deferReply();

      const domain = i.options.getString("url")
        .replace(/^https?:\/\//, "")
        .split("/")[0];

      const [forti, dnsCheck] = await Promise.all([
        checkForti(domain),
        checkDNS(domain)
      ]);

      const fake = classify(domain);

      const results = [
        `FortiGuard (${forti.category}) ${forti.status}`,
        `DNS (${dnsCheck.category}) ${dnsCheck.status}`,
        `Filters (${fake.category}) ${fake.status}`
      ];

      return i.editReply(results.join("\n"));
    }

    if (cmd === "kick") {
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.kick();
      return i.reply("Kicked");
    }

    if (cmd === "ban") {
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.ban();
      return i.reply("Banned");
    }

    if (cmd === "timeout") {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");

      const member = await i.guild.members.fetch(user.id);
      await member.timeout(mins * 60000);

      return i.reply("Timed out");
    }

    if (cmd === "warn") {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason");

      if (!warns[user.id]) warns[user.id] = [];
      warns[user.id].push(reason);
      saveDB();

      return i.reply("Warned");
    }

    if (cmd === "warnings") {
      const user = i.options.getUser("user");
      const list = warns[user.id] || [];

      return i.reply(list.join("\n") || "None");
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("Error");
    else i.reply("Error");
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
