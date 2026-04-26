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

// ───────── CRASH SAFETY ─────────
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

// ───────── SAFE LOAD JSON ─────────
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

// ───────── GUILD SAFE CONFIG ─────────
function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      whitelist: [],
      logChannel: null,
      raid: {
        maxJoins: 5,
        joinWindow: 10000,
        antiSpam: true,
        antiLinks: true,
        autoLockdown: true
      }
    };
  }
  return config[id];
}

// ───────── EMBED HELPER ─────────
function embed(title, color, fields = []) {
  const e = new EmbedBuilder()
    .setTitle(title || "Info")
    .setColor(color || 0x2ecc71)
    .setTimestamp();

  if (fields.length) e.addFields(fields);
  return e;
}

// ───────── SAFE HELPERS ─────────
const getUser = (i, n) => i.options.getUser(n);
const getRole = (i, n) => i.options.getRole(n);

async function memberFetch(guild, user) {
  if (!guild || !user) return null;
  return guild.members.fetch(user.id).catch(() => null);
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

// ───────── RAID SYSTEM CORE ─────────
const joins = new Map();
const messages = new Map();

function trackJoins(gid) {
  if (!joins.has(gid)) joins.set(gid, []);
  return joins.get(gid);
}

function trackMsgs(uid) {
  if (!messages.has(uid)) messages.set(uid, []);
  return messages.get(uid);
}

// ───────── RAID DETECTION ─────────
async function lockdown(guild) {
  const g = getGuild(guild.id);

  guild.channels.cache.forEach(ch => {
    ch.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false,
      ViewChannel: true
    }).catch(() => {});
  });

  const log = guild.channels.cache.get(g.logChannel);
  if (log) log.send("🚨 RAID DETECTED — AUTO LOCKDOWN ACTIVE").catch(() => {});
}

// ───────── JOIN TRACK ─────────
client.on("guildMemberAdd", async m => {
  const g = getGuild(m.guild.id);
  if (!g.antiraid) return;

  const arr = trackJoins(m.guild.id);
  arr.push(Date.now());

  const recent = arr.filter(t => Date.now() - t < g.raid.joinWindow);

  if (recent.length >= g.raid.maxJoins && g.raid.autoLockdown) {
    await lockdown(m.guild);
  }
});

// ───────── MESSAGE TRACK ─────────
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const g = getGuild(msg.guild.id);
  const arr = trackMsgs(msg.author.id);

  arr.push(Date.now());

  const recent = arr.filter(t => Date.now() - t < 4000);

  // spam
  if (g.raid.antiSpam && recent.length > 5) {
    msg.member?.timeout(5 * 60 * 1000).catch(() => {});
  }

  // links
  if (g.raid.antiLinks && /(https?:\/\/)/.test(msg.content)) {
    msg.delete().catch(() => {});
    msg.member?.timeout(3 * 60 * 1000).catch(() => {});
  }
});

// ───────── SLASH COMMANDS (FIXED SAFE BUILDERS) ─────────
const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as bot")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask 8ball")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target")
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
        .setDescription("Target")
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
        .setDescription("Target")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("1-100")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("nickname")
        .setDescription("New nickname")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add role to user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role")
        .setDescription("Role")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Enable raid protection")

].map(c => c.toJSON());

// ───────── READY ─────────
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  updateStatus();
  setInterval(updateStatus, 15000);

  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ───────── INTERACTIONS ─────────
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const g = getGuild(i.guild.id);
  const m = await memberFetch(i.guild, i.user);

  try {
    served++;

    if (i.commandName === "ping") {
      return i.reply({
        embeds: [embed("🏓 Pong", 0x2ecc71, [
          { name: "API", value: `${client.ws.ping}ms`, inline: true },
          { name: "Bot", value: `${Date.now() % 1000}ms`, inline: true }
        ])]
      });
    }

    if (i.commandName === "say") {
      await i.channel.send(i.options.getString("message"));
      return i.reply({ content: "Sent", ephemeral: true });
    }

    if (i.commandName === "8ball") {
      const answers = ["Yes", "No", "Maybe", "Definitely", "Ask again"];
      return i.reply({
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Q", value: i.options.getString("question") },
          { name: "A", value: answers[Math.floor(Math.random() * answers.length)] }
        ])]
      });
    }

    if (i.commandName === "setnick") {
      const user = getUser(i, "user");
      const nick = i.options.getString("nickname");
      const mem = await memberFetch(i.guild, user);

      if (!mem?.manageable)
        return i.reply({ content: "❌ Can't change nick", ephemeral: true });

      await mem.setNickname(nick);
      return i.reply({ embeds: [embed("Nickname updated")] });
    }

    if (i.commandName === "addrole") {
      const user = getUser(i, "user");
      const role = getRole(i, "role");
      const mem = await memberFetch(i.guild, user);

      if (!mem || !role?.editable)
        return i.reply({ content: "❌ Cannot add role", ephemeral: true });

      await mem.roles.add(role);
      return i.reply({ embeds: [embed("Role added")] });
    }

    if (i.commandName === "antiraid") {
      g.antiraid = true;
      saveConfig();
      return i.reply({ embeds: [embed("🛡 Anti-raid enabled")] });
    }

  } catch (e) {
    console.error(e);
    return i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────
client.login(process.env.TOKEN);
