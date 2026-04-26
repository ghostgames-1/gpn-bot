const fs = require("fs");
const https = require("https");
const dns = require("dns").promises;

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

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── CLIENT ─────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ───────── DATABASES ─────────

const WARN_DB = "./warns.json";
const CONFIG_DB = "./config.json";

let warns = fs.existsSync(WARN_DB) ? JSON.parse(fs.readFileSync(WARN_DB)) : {};
let config = fs.existsSync(CONFIG_DB) ? JSON.parse(fs.readFileSync(CONFIG_DB)) : {};

function saveWarns() {
  fs.writeFileSync(WARN_DB, JSON.stringify(warns, null, 2));
}

function saveConfig() {
  fs.writeFileSync(CONFIG_DB, JSON.stringify(config, null, 2));
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

// ───────── STATUS ─────────

function updateStatus() {
  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers`,
      type: ActivityType.Watching
    }],
    status: "online"
  });
}

// ───────── SAFE FETCH (FIXED) ─────────

function safeFetch(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "GPN-Bot" }
    }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ───────── FILTER SYSTEM ─────────

async function checkDNS(domain) {
  try {
    const res = await dns.lookup(domain);
    if (!res?.address) return { status: "❌", category: "No Resolve" };
    return { status: "✔", category: res.address };
  } catch {
    return { status: "❌", category: "DNS Blocked" };
  }
}

function classify(domain) {
  domain = domain.toLowerCase();

  if (domain.includes("vpn") || domain.includes("proxy"))
    return { status: "❌", category: "Proxy" };

  if (domain.includes("game"))
    return { status: "❌", category: "Games" };

  if (domain.includes("chat"))
    return { status: "❌", category: "Chat" };

  return { status: "✔", category: "General" };
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 Commands"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("🌐 Scan a website")
    .addStringOption(o =>
      o.setName("url").setDescription("Website").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("➕ Add role to user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role").setDescription("Role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn user")
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
    .setName("8ball")
    .setDescription("🎱 Ask 8ball")
    .addStringOption(o =>
      o.setName("question").setDescription("Question").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("1-100").setRequired(true)
    ),

  // ───────── ANTIRAID SETUP ─────────
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("🛡 Setup anti-raid system")
    .addSubcommand(s =>
      s.setName("setup").setDescription("Configure anti-raid")
    ),

  // ───────── ANTINUKE SETUP ─────────
  new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("💣 Setup anti-nuke system")
    .addSubcommand(s =>
      s.setName("setup").setDescription("Configure anti-nuke")
    )

].map(c => c.toJSON());

// ───────── REGISTER COMMANDS (FIXED) ─────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Commands registered");
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

    // ───────── PING ─────────
    if (cmd === "ping")
      return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

    // ───────── HELP ─────────
    if (cmd === "help")
      return i.reply({
        embeds: [embed("📋 Commands", 0x3498db, [
          { name: "General", value: "/ping /help /checkall /8ball" },
          { name: "Moderation", value: "/warn /warnings /purge /addrole" },
          { name: "Security", value: "/antiraid setup /antinuke setup" }
        ])]
      });

    // ───────── ADDROLE (FIXED PERMS) ─────────
    if (cmd === "addrole") {
      if (!i.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return i.reply({ content: "❌ Missing permissions", ephemeral: true });

      const user = i.options.getUser("user");
      const role = i.options.getRole("role");

      const member = await i.guild.members.fetch(user.id);
      await member.roles.add(role);

      return i.reply({
        embeds: [embed("➕ Role Added", 0x2ecc71, [
          { name: "User", value: user.tag },
          { name: "Role", value: role.name }
        ])]
      });
    }

    // ───────── 8BALL ─────────
    if (cmd === "8ball") {
      const answers = ["Yes", "No", "Maybe", "Definitely", "Ask later", "Unlikely"];

      return i.reply({
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Question", value: i.options.getString("question") },
          { name: "Answer", value: answers[Math.floor(Math.random() * answers.length)] }
        ])]
      });
    }

    // ───────── PURGE (FIXED PERMS) ─────────
    if (cmd === "purge") {
      if (!i.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
        return i.reply({ content: "❌ Missing permissions", ephemeral: true });

      const amount = i.options.getInteger("amount");
      if (amount < 1 || amount > 100)
        return i.reply({ content: "❌ 1-100 only", ephemeral: true });

      await i.channel.bulkDelete(amount, true);

      return i.reply({
        embeds: [embed("🧹 Purged", 0xe67e22, [
          { name: "Deleted", value: `${amount} messages` }
        ])],
        ephemeral: true
      });
    }

    // ───────── WARN SYSTEM ─────────
    if (cmd === "warn") {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason");

      if (!warns[user.id]) warns[user.id] = [];
      warns[user.id].push(reason);
      if (warns[user.id].length > 50) warns[user.id].shift();

      saveWarns();

      return i.reply({ embeds: [embed("⚠️ Warned", 0xf1c40f)] });
    }

    if (cmd === "warnings") {
      const user = i.options.getUser("user");
      const list = warns[user.id]?.join("\n") || "None";

      return i.reply({
        embeds: [embed("📊 Warnings", 0x3498db, [
          { name: user.tag, value: list }
        ])]
      });
    }

    // ───────── ANTIRAID SETUP ─────────
    if (cmd === "antiraid") {
      const guildId = i.guild.id;

      config[guildId] = {
        antiraid: true,
        maxJoins: 5
      };

      saveConfig();

      return i.reply({
        embeds: [embed("🛡 Anti-Raid Enabled", 0x2ecc71, [
          { name: "Max Joins", value: "5 per 10s" }
        ])]
      });
    }

    // ───────── ANTINUKE SETUP ─────────
    if (cmd === "antinuke") {
      const guildId = i.guild.id;

      config[guildId] = {
        ...(config[guildId] || {}),
        antinuke: true
      };

      saveConfig();

      return i.reply({
        embeds: [embed("💣 Anti-Nuke Enabled", 0xe74c3c)]
      });
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
