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

function fetchSite(url) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, res => {
        let data = "";
        res.on("data", d => data += d);
        res.on("end", () => resolve(data.toLowerCase()));
      });

      req.on("error", () => resolve(null));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });

    } catch {
      resolve(null);
    }
  });
}

// ───────── FILTER ENGINE ─────────

const FILTERS = {
  FortiGuard: ["fortiguard"],
  Lightspeed: ["lightspeed"],
  Securly: ["securly"],
  GoGuardian: ["goguardian"],
  Blocksi: ["blocksi"],
  Linewize: ["linewize"],
  ContentKeeper: ["contentkeeper"]
};

// ───────── COMMANDS (VALID) ─────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("about")
    .setDescription("🤖 Bot info"),

  new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("📊 Server analytics"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("🌐 Scan a website across filters")
    .addStringOption(o =>
      o.setName("url")
        .setDescription("Website URL")
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
        .setDescription("Minutes")
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
    .setDescription("📊 View warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ───────── REGISTER (GUILD ONLY) ─────────

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

  console.log("✅ Guild commands synced");
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

    if (cmd === "ping") {
      return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });
    }

    if (cmd === "help") {
      return i.reply({
        embeds: [embed("📋 Commands", 0x3498db, [
          { name: "General", value: "/ping /help /about /analytics /checkall" },
          { name: "Moderation", value: "/kick /ban /timeout /warn /warnings" }
        ])]
      });
    }

    if (cmd === "about") {
      return i.reply({
        embeds: [embed("🤖 About", 0x9b59b6, [
          { name: "Servers", value: `${client.guilds.cache.size}` }
        ])]
      });
    }

    if (cmd === "analytics") {
      return i.reply({
        embeds: [embed("📊 Analytics", 0x1abc9c, [
          { name: "Servers", value: `${client.guilds.cache.size}` },
          { name: "Users", value: `${client.users.cache.size}` }
        ])]
      });
    }

    // ───── CHECKALL ─────

    if (cmd === "checkall") {
      await i.deferReply();

      let url = i.options.getString("url");
      if (!url.startsWith("http")) url = "https://" + url;

      const html = await fetchSite(url);

      if (!html) {
        return i.editReply({
          embeds: [embed("❌ Scan Failed", 0xe74c3c, [
            { name: "Result", value: "Site unreachable or blocked" }
          ])]
        });
      }

      let results = [];
      let blocked = 0;

      for (const [name, sigs] of Object.entries(FILTERS)) {
        const hit = sigs.some(s => html.includes(s));

        if (hit) {
          results.push(`❌ ${name}`);
          blocked++;
        } else {
          results.push(`✔ ${name}`);
        }
      }

      return i.editReply({
        embeds: [embed("🌐 Scan Results", blocked ? 0xe74c3c : 0x2ecc71, [
          { name: "URL", value: url },
          { name: "Filters", value: results.join("\n") }
        ])]
      });
    }

    // ───── MODERATION ─────

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
        embeds: [embed(`✅ ${type.toUpperCase()}`, 0xe67e22, [
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

    if (i.deferred) {
      i.editReply("❌ Error occurred");
    } else {
      i.reply({ content: "❌ Error occurred", ephemeral: true });
    }
  }
});

// ───────── LOGIN ─────────

if (!process.env.TOKEN) {
  console.log("❌ Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
