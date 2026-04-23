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
// WARN DB
// ─────────────────────────────

const DB_FILE = "./warns.json";

let warns = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ─────────────────────────────
// EMBEDS
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
// LIVE STATUS (WATCHING SERVERS)
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
    .setName("checkall")
    .setDescription("Check website against all filters")
    .addStringOption(o =>
      o.setName("url")
        .setDescription("Website URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
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
    .setDescription("Warn user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (GUILD ONLY)
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

  console.log("✅ Commands synced");
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();

  setInterval(updateStatus, 15000);
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
        { name: "Status", value: "Live monitoring 👀" }
      ])]
    });

  if (commandName === "analytics")
    return i.reply({
      embeds: [embed("Analytics", 0x1abc9c, [
        { name: "Servers", value: `${client.guilds.cache.size}` }
      ])]
    });

  // ───────── SAY ─────────

  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply({ embeds: [embed("Sent", 0x2ecc71)] });
  }

  // ───────── CHECKALL (FIXED RAILWAY SAFE) ─────────

  if (commandName === "checkall") {
    await i.deferReply();

    let url = i.options.getString("url");
    if (!url) return i.editReply("❌ No URL provided");

    if (!url.startsWith("http")) url = "https://" + url;

    let results = [];
    let category = "Unknown";

    try {
      let res;

      if (global.fetch) {
        res = await fetch(url).catch(() => null);
      } else {
        const https = require("https");

        res = await new Promise(resolve => {
          https.get(url, r => resolve(r)).on("error", () => resolve(null));
        });
      }

      if (!res) {
        return i.editReply({
          embeds: [embed("CHECKALL", 0xe74c3c, [
            { name: "URL", value: url },
            { name: "Result", value: "❌ Unreachable / Blocked" }
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

      if (lower.includes("game")) category = "Gaming";
      if (lower.includes("education")) category = "Education";
      if (lower.includes("video")) category = "Video";
      if (lower.includes("social")) category = "Social Media";

      let blocked = [];

      for (const [name, sigs] of Object.entries(filters)) {
        const hit = sigs.some(s => lower.includes(s));

        if (hit) {
          results.push(`❌ ${name}`);
          blocked.push(name);
        } else {
          results.push(`✔ ${name}`);
        }
      }

      return i.editReply({
        embeds: [
          embed("🌐 CHECKALL", blocked.length ? 0xe74c3c : 0x2ecc71, [
            { name: "URL", value: url },
            { name: "Category Guess", value: category },
            { name: "Status", value: blocked.length ? "Blocked" : "Unblocked" },
            { name: "Filters", value: results.join("\n") }
          ])
        ]
      });

    } catch (err) {
      console.error(err);

      return i.editReply({
        embeds: [embed("ERROR", 0xe74c3c, [
          { name: "Result", value: "Internal error or request failed" }
        ])]
      });
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
