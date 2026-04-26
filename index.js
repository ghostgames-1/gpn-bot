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

// ───────── EMBED BUILDER ─────────

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

function safeFetch(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    }).on("error", () => resolve(null));
  });
}

// ───────── FILTER ENGINE ─────────

async function checkForti(domain) {
  try {
    const url = `https://api.allorigins.win/raw?url=https://fortiguard.com/webfilter?q=${domain}`;
    const data = await safeFetch(url);

    if (!data) return { status: "⚠", category: "Error" };

    return {
      status: data.toLowerCase().includes("block") ? "❌" : "✔",
      category: "FortiGuard"
    };
  } catch {
    return { status: "⚠", category: "Error" };
  }
}

async function checkDNS(domain) {
  try {
    const res = await dns.lookup(domain);

    if (!res?.address)
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
    .setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("🌐 Scan a website across filters")
    .addStringOption(o =>
      o.setName("url")
        .setDescription("Website URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Owner only message")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick a user")
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
    .setDescription("🔨 Ban a user")
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
    .setDescription("⏳ Timeout a user")
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
    .setDescription("⚠️ Warn a user")
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
    .setDescription("📊 View warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("🎱 Ask the magic 8-ball")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages (1-100)")
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
      return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

    if (cmd === "help")
      return i.reply({
        embeds: [embed("📋 Commands", 0x3498db, [
          { name: "General", value: "/ping /help /checkall /8ball" },
          { name: "Moderation", value: "/kick /ban /timeout /warn /warnings /purge" }
        ])]
      });

    if (cmd === "say") {
      if (i.guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      await i.channel.send(i.options.getString("message"));
      return i.reply({ embeds: [embed("✅ Sent", 0x2ecc71)], ephemeral: true });
    }

    // ───────── 8BALL ─────────

    if (cmd === "8ball") {
      const q = i.options.getString("question");

      const answers = [
        "Yes", "No", "Maybe", "Definitely",
        "Ask again later", "Unlikely"
      ];

      return i.reply({
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Question", value: q },
          { name: "Answer", value: answers[Math.floor(Math.random()*answers.length)] }
        ])]
      });
    }

    // ───────── PURGE ─────────

    if (cmd === "purge") {
      const amount = i.options.getInteger("amount");

      if (!i.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
        return i.reply({ content: "❌ No permission", ephemeral: true });

      if (amount < 1 || amount > 100)
        return i.reply({ content: "❌ Must be 1-100", ephemeral: true });

      await i.channel.bulkDelete(amount, true);

      return i.reply({
        embeds: [embed("🧹 Purged", 0xe67e22, [
          { name: "Deleted", value: `${amount} messages` }
        ])],
        ephemeral: true
      });
    }

    // ───────── CHECKALL ─────────

    if (cmd === "checkall") {
      await i.deferReply();

      const domain = i.options.getString("url")
        .replace(/^https?:\/\//, "")
        .split("/")[0];

      const [forti, dnsCheck] = await Promise.all([
        checkForti(domain),
        checkDNS(domain)
      ]);

      const filters = {
        "FortiGuard": forti,
        "DNS": dnsCheck,
        "Lightspeed": classify(domain),
        "Securly": classify(domain),
        "GoGuardian": classify(domain),
        "Blocksi": classify(domain),
        "Linewize": classify(domain),
        "ContentKeeper": classify(domain)
      };

      let lines = [];
      let blocked = 0;
      let allowed = 0;

      for (const [name, data] of Object.entries(filters)) {
        lines.push(`${name} (${data.category}) ${data.status}`);
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
            .setTimestamp()
        ]
      });
    }

    // ───────── MODERATION ─────────

    if (["kick","ban","timeout"].includes(cmd)) {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";

      const member = await i.guild.members.fetch(user.id);

      if (cmd === "kick") await member.kick(reason);
      if (cmd === "ban") await member.ban({ reason });
      if (cmd === "timeout") {
        const mins = i.options.getInteger("minutes");
        await member.timeout(mins * 60000, reason);
      }

      return i.reply({
        embeds: [embed(`✅ ${cmd.toUpperCase()}`, 0xe67e22, [
          { name: "User", value: user.tag },
          { name: "Reason", value: reason }
        ])]
      });
    }

    if (cmd === "warn") {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason");

      if (!warns[user.id]) warns[user.id] = [];
      warns[user.id].push(reason);
      saveDB();

      return i.reply({
        embeds: [embed("⚠️ Warned", 0xf1c40f, [
          { name: "User", value: user.tag },
          { name: "Reason", value: reason }
        ])]
      });
    }

    if (cmd === "warnings") {
      const user = i.options.getUser("user");
      const list = warns[user.id] || [];

      return i.reply({
        embeds: [embed("📊 Warnings", 0x3498db, [
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

client.login(process.env.TOKEN);
