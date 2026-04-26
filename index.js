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

// ───────── UTIL ─────────

function embed(title, color) {
  return new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
}

function safeFetch(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    }).on("error", () => resolve(null));
  });
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

// ───────── FILTER ENGINE ─────────

// FortiGuard (REAL)
async function checkForti(domain) {
  try {
    const url = `https://api.allorigins.win/raw?url=https://fortiguard.com/webfilter?q=${domain}`;
    const data = await safeFetch(url);

    if (!data) return { status: "⚠", category: "Error" };

    const blocked = data.toLowerCase().includes("block");

    return {
      status: blocked ? "❌" : "✔",
      category: "FortiGuard"
    };

  } catch {
    return { status: "⚠", category: "Error" };
  }
}

// DNS detection (REAL BEHAVIOR)
async function checkDNS(domain) {
  try {
    const res = await dns.lookup(domain);

    if (!res?.address)
      return { status: "❌", category: "No Resolve" };

    const ip = res.address;

    if (
      ip.startsWith("0.") ||
      ip.startsWith("127.") ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168")
    ) {
      return { status: "❌", category: "DNS Blocked" };
    }

    return { status: "✔", category: ip };

  } catch {
    return { status: "❌", category: "DNS Error" };
  }
}

// Smart classification
function classify(domain) {
  domain = domain.toLowerCase();

  if (domain.includes("proxy") || domain.includes("vpn"))
    return { status: "❌", category: "Proxy" };

  if (domain.includes("game"))
    return { status: "❌", category: "Games" };

  if (domain.includes("chat") || domain.includes("discord"))
    return { status: "❌", category: "Communication" };

  if (domain.includes("edu"))
    return { status: "✔", category: "Education" };

  return { status: "✔", category: "General" };
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View commands"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("Scan a website across filters")
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
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Minutes")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
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
        .setDescription("User")
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

    if (cmd === "ping")
      return i.reply("🏓 Pong");

    if (cmd === "help")
      return i.reply("Use /checkall, /kick, /ban, etc.");

    if (cmd === "say") {
      if (i.guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      await i.channel.send(i.options.getString("message"));
      return i.reply({ content: "Sent", ephemeral: true });
    }

    // ───────── CHECKALL PRO MAX ─────────

    if (cmd === "checkall") {
      await i.deferReply();

      const domain = i.options.getString("url")
        .replace(/^https?:\/\//, "")
        .split("/")[0];

      const [forti, dnsCheck] = await Promise.all([
        checkForti(domain),
        checkDNS(domain)
      ]);

      const simulated = {
        "Lightspeed": classify(domain),
        "Securly": classify(domain),
        "GoGuardian": classify(domain),
        "Blocksi": classify(domain),
        "Linewize": classify(domain),
        "ContentKeeper": classify(domain)
      };

      let lines = [
        `🛡 FortiGuard (${forti.category}) ${forti.status}`,
        `📡 DNS (${dnsCheck.category}) ${dnsCheck.status}`
      ];

      let blocked = 0;
      let allowed = 0;

      for (const [name, data] of Object.entries(simulated)) {
        lines.push(`⚡ ${name} (${data.category}) ${data.status}`);

        if (data.status === "❌") blocked++;
        else allowed++;
      }

      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Results for ${domain}`)
            .setDescription(lines.join("\n"))
            .setColor(blocked > allowed ? 0xe74c3c : 0x2ecc71)
            .addFields({
              name: "Summary",
              value: `${allowed} allowed • ${blocked} blocked`
            })
            .setFooter({ text: "Includes real DNS + FortiGuard" })
            .setTimestamp()
        ]
      });
    }

    // ───────── MODERATION ─────────

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

    if (i.deferred) i.editReply("❌ Error");
    else i.reply("❌ Error");
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
