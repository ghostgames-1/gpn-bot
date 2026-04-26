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

// ───────── REAL CHECK FUNCTION ─────────

async function checkFortiGuard(domain) {
  try {
    const apiURL = `https://api.allorigins.win/raw?url=https://fortiguard.com/webfilter?q=${domain}`;
    const data = await fetchURL(apiURL);

    if (!data) return { status: "Error", category: "Unknown" };

    const text = data.toLowerCase();

    let status = "Unknown";
    if (text.includes("block")) status = "Blocked";
    if (text.includes("allow")) status = "Allowed";

    let category = "Unknown";
    const match = text.match(/category:.*?<.*?>(.*?)</);
    if (match) category = match[1];

    return { status, category };

  } catch {
    return { status: "Error", category: "Unknown" };
  }
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Check latency"),
  new SlashCommandBuilder().setName("help").setDescription("📋 Show commands"),
  new SlashCommandBuilder().setName("about").setDescription("🤖 Bot info"),
  new SlashCommandBuilder().setName("analytics").setDescription("📊 Server stats"),

  new SlashCommandBuilder()
    .setName("checkall")
    .setDescription("🌐 Check website filtering status")
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
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))

].map(c => c.toJSON());

// ───────── REGISTER GLOBAL ─────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await client.application.fetch();

  try {
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: commands }
    );

    console.log("🌍 Global commands synced");
  } catch (err) {
    console.error("❌ Register error:", err);
  }
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
      return i.reply({
        embeds: [embed("📋 Commands", 0x3498db, [
          { name: "General", value: "/ping /help /about /analytics /checkall /say" },
          { name: "Moderation", value: "/kick /ban /timeout /warn /warnings" }
        ])]
      });

    if (cmd === "about")
      return i.reply({
        embeds: [embed("🤖 About", 0x9b59b6, [
          { name: "Servers", value: `${client.guilds.cache.size}` }
        ])]
      });

    if (cmd === "analytics")
      return i.reply({
        embeds: [embed("📊 Analytics", 0x1abc9c, [
          { name: "Servers", value: `${client.guilds.cache.size}` },
          { name: "Users", value: `${client.users.cache.size}` }
        ])]
      });

    // OWNER SAY
    if (cmd === "say") {
      if (guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      await i.deferReply({ ephemeral: true });
      await i.channel.send(i.options.getString("message"));

      return i.editReply({ embeds: [embed("✅ Sent", 0x2ecc71)] });
    }

    // REAL CHECKALL
    if (cmd === "checkall") {
      await i.deferReply();

      let url = i.options.getString("url");
      const domain = url.replace(/^https?:\/\//, "").split("/")[0];

      const result = await checkFortiGuard(domain);

      return i.editReply({
        embeds: [embed("🌐 Filter Check", 0x3498db, [
          { name: "URL", value: domain },
          { name: "FortiGuard Status", value: result.status },
          { name: "Category", value: result.category }
        ])]
      });
    }

    // MODERATION
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
        embeds: [embed(`✅ ${type}`, 0xe67e22, [
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

    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

if (!process.env.TOKEN) {
  console.log("❌ Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
