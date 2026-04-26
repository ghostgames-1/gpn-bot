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
    }],
    status: "online"
  });
}

// ───────── SAFE FETCH ─────────

function fetchURL(url) {
  return new Promise(resolve => {
    try {
      https.get(url, res => {
        let data = "";
        res.on("data", d => data += d);
        res.on("end", () => resolve(data));
      }).on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// ───────── FORTIGUARD ─────────

async function checkForti(domain) {
  try {
    const url = `https://api.allorigins.win/raw?url=https://fortiguard.com/webfilter?q=${domain}`;
    const data = await fetchURL(url);

    if (!data) return { status: "⚠", category: "Error" };

    const text = data.toLowerCase();

    let status = text.includes("block") ? "❌" : "✔";

    let category = "Unknown";
    const match = text.match(/category:.*?<.*?>(.*?)</);
    if (match) category = match[1];

    return { status, category };

  } catch {
    return { status: "⚠", category: "Error" };
  }
}

// ───────── DNS CHECK ─────────

async function checkDNS(domain) {
  try {
    const res = await dns.lookup(domain);

    if (!res || !res.address)
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

    return { status: "✔", category: `Resolved (${ip})` };

  } catch {
    return { status: "❌", category: "DNS Error" };
  }
}

// ───────── MULTI DNS (CLOUDFLARE + GOOGLE) ─────────

async function checkMultiDNS(domain) {
  try {
    const cf = await fetchURL(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`);
    const google = await fetchURL(`https://dns.google/resolve?name=${domain}`);

    if (!cf || !google)
      return { status: "⚠", category: "DNS API Error" };

    if (cf.includes("Answer") && google.includes("Answer"))
      return { status: "✔", category: "Public DNS OK" };

    return { status: "❌", category: "Public DNS Blocked" };

  } catch {
    return { status: "⚠", category: "DNS Check Failed" };
  }
}

// ───────── SMART CLASSIFIER ─────────

function classify(domain) {
  domain = domain.toLowerCase();

  if (domain.includes("proxy") || domain.includes("vpn"))
    return { status: "❌", category: "Proxy" };

  if (domain.includes("game"))
    return { status: "❌", category: "Games" };

  if (domain.includes("chat") || domain.includes("discord"))
    return { status: "❌", category: "Communication" };

  if (domain.includes("shop"))
    return { status: "✔", category: "Shopping" };

  if (domain.includes("edu"))
    return { status: "✔", category: "Education" };

  return { status: "✔", category: "General" };
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Ping bot"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),
  new SlashCommandBuilder().setName("about").setDescription("Bot info"),
  new SlashCommandBuilder().setName("analytics").setDescription("Stats"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("Scan a website across filters (PRO MAX)")
    .addStringOption(o =>
      o.setName("url").setDescription("Website URL").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Owner only message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o => o.setName("user").setRequired(true))

].map(c => c.toJSON());

// ───────── REGISTER GLOBAL ─────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await client.application.fetch();

  await rest.put(
    Routes.applicationCommands(client.application.id),
    { body: commands }
  );

  console.log("🌍 Global commands synced");
}

// ───────── READY ─────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();
  setInterval(updateStatus, 15000);
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const cmd = i.commandName;
  const guild = i.guild;

  try {

    if (cmd === "ping")
      return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

    if (cmd === "help")
      return i.reply({ embeds: [embed("Commands", 0x3498db)] });

    if (cmd === "about")
      return i.reply({
        embeds: [embed("About", 0x9b59b6, [
          { name: "Servers", value: `${client.guilds.cache.size}` }
        ])]
      });

    if (cmd === "analytics")
      return i.reply({
        embeds: [embed("Analytics", 0x1abc9c, [
          { name: "Servers", value: `${client.guilds.cache.size}` },
          { name: "Users", value: `${client.users.cache.size}` }
        ])]
      });

    if (cmd === "say") {
      if (guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      await i.deferReply({ ephemeral: true });
      await i.channel.send(i.options.getString("message"));
      return i.editReply({ embeds: [embed("Sent", 0x2ecc71)] });
    }

    // ───────── CHECKALL PRO MAX ─────────

    if (cmd === "checkall") {
      await i.deferReply();

      let url = i.options.getString("url");
      const domain = url.replace(/^https?:\/\//, "").split("/")[0];

      const [forti, dnsCheck, multiDNS] = await Promise.all([
        checkForti(domain),
        checkDNS(domain),
        checkMultiDNS(domain)
      ]);

      const filters = {
        "🛡 FortiGuard": forti,
        "📡 DNS": dnsCheck,
        "🌍 Public DNS": multiDNS,
        "⚡ Lightspeed": classify(domain),
        "🔑 Securly": classify(domain),
        "👁 GoGuardian": classify(domain),
        "🕸 Blocksi": classify(domain),
        "📡 Linewize": classify(domain),
        "📁 ContentKeeper": classify(domain)
      };

      let lines = [];
      let blocked = 0;
      let allowed = 0;
      let warn = 0;

      for (const [name, data] of Object.entries(filters)) {
        lines.push(`${name} (${data.category}) ${data.status}`);

        if (data.status === "❌") blocked++;
        else if (data.status === "✔") allowed++;
        else warn++;
      }

      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(blocked > allowed ? 0xe74c3c : 0x2ecc71)
            .setTitle(`Results for ${domain}`)
            .setDescription(lines.join("\n"))
            .addFields({
              name: "Summary",
              value: `${allowed} unblocked • ${blocked} blocked • ${warn} issues`
            })
            .setFooter({
              text: "Includes real DNS + FortiGuard checks"
            })
            .setTimestamp()
        ]
      });
    }

    // ───────── MODERATION ─────────

    async function mod(type) {
      await i.deferReply();

      if (!i.member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return i.editReply("❌ No permission");

      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return i.editReply("User not found");

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

    if (cmd === "kick") return mod("kick");
    if (cmd === "ban") return mod("ban");
    if (cmd === "timeout") return mod("timeout");

    if (cmd === "warn") {
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

    if (cmd === "warnings") {
      const user = i.options.getUser("user");
      const list = warns[user.id] || [];

      return i.reply({
        embeds: [embed("Warnings", 0x3498db, [
          { name: user.tag, value: list.join("\n") || "None" }
        ])]
      });
    }

  } catch (err) {
    console.error(err);

    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
