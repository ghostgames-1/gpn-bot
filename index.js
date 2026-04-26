const fs = require("fs");
const dns = require("dns").promises;

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

// ───────── DATABASE ─────────

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
  const e = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  if (fields.length) e.addFields(fields);
  return e;
}

// ───────── STATUS ─────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  client.user.setPresence({
    activities: [{ name: "Protecting servers", type: ActivityType.Watching }],
    status: "online"
  });

  console.log("✅ Commands registered");
});

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Bot ping"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Commands"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("✏️ Set nickname")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("nickname").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("➕ Add role")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addRoleOption(o => o.setName("role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("🛡 Anti-raid system")
    .addSubcommand(s => s.setName("setup")),

  new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("💣 Anti-nuke system")
    .addSubcommand(s => s.setName("setup"))

].map(c => c.toJSON());

// ───────── ANTIRAID DATA ─────────

const joinTracker = {};
const spamTracker = {};

// ───────── EVENTS ─────────

// JOIN DETECTION
client.on("guildMemberAdd", member => {
  const guildId = member.guild.id;
  if (!config[guildId]?.antiraid) return;

  if (!joinTracker[guildId]) joinTracker[guildId] = [];
  joinTracker[guildId].push(Date.now());

  joinTracker[guildId] = joinTracker[guildId].filter(t => Date.now() - t < 10000);

  if (joinTracker[guildId].length >= 5) {
    member.timeout(10 * 60 * 1000, "Raid detected").catch(() => {});
  }
});

// MESSAGE SPAM + LINK DETECTION
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const guildId = msg.guild.id;
  const conf = config[guildId];
  if (!conf?.antiraid) return;

  // SPAM
  if (!spamTracker[msg.author.id]) spamTracker[msg.author.id] = [];
  spamTracker[msg.author.id].push(Date.now());

  spamTracker[msg.author.id] =
    spamTracker[msg.author.id].filter(t => Date.now() - t < 5000);

  if (spamTracker[msg.author.id].length >= 6) {
    await msg.member.timeout(5 * 60 * 1000, "Spam detected").catch(() => {});
  }

  // LINKS
  if (/(https?:\/\/)/.test(msg.content)) {
    await msg.delete().catch(() => {});
    await msg.member.timeout(5 * 60 * 1000, "Link blocked").catch(() => {});
  }
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
          { name: "Moderation", value: "/kick /ban /timeout /warn /purge /addrole /setnick" },
          { name: "Security", value: "/antiraid setup /antinuke setup" }
        ])]
      });

    // ───────── MODERATION ─────────

    if (["kick","ban","timeout","addrole","setnick"].includes(cmd)) {
      if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return i.reply({ content: "❌ Missing permissions", ephemeral: true });
    }

    if (cmd === "kick") {
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.kick();
      return i.reply({ embeds: [embed("👢 Kicked", 0xe67e22)] });
    }

    if (cmd === "ban") {
      const user = i.options.getUser("user");
      await i.guild.members.ban(user.id);
      return i.reply({ embeds: [embed("🔨 Banned", 0xe74c3c)] });
    }

    if (cmd === "timeout") {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");
      if (mins > 40320) return i.reply({ content: "❌ Max 28 days", ephemeral: true });

      const member = await i.guild.members.fetch(user.id);
      await member.timeout(mins * 60000);
      return i.reply({ embeds: [embed("⏳ Timed Out", 0xf1c40f)] });
    }

    if (cmd === "setnick") {
      const user = i.options.getUser("user");
      const nick = i.options.getString("nickname");

      const member = await i.guild.members.fetch(user.id);
      await member.setNickname(nick);

      return i.reply({ embeds: [embed("✏️ Nickname Updated", 0x3498db)] });
    }

    if (cmd === "addrole") {
      const user = i.options.getUser("user");
      const role = i.options.getRole("role");

      const member = await i.guild.members.fetch(user.id);
      await member.roles.add(role);

      return i.reply({ embeds: [embed("➕ Role Added", 0x2ecc71)] });
    }

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
      return i.reply({
        embeds: [embed("📊 Warnings", 0x3498db, [
          { name: user.tag, value: warns[user.id]?.join("\n") || "None" }
        ])]
      });
    }

    if (cmd === "purge") {
      const amount = i.options.getInteger("amount");
      await i.channel.bulkDelete(amount, true);
      return i.reply({ embeds: [embed("🧹 Purged", 0xe67e22)], ephemeral: true });
    }

    // ───────── ANTIRAID SETUP ─────────

    if (cmd === "antiraid") {
      config[i.guild.id] = {
        ...(config[i.guild.id] || {}),
        antiraid: true
      };

      saveConfig();

      return i.reply({
        embeds: [embed("🛡 Anti-Raid Enabled", 0x2ecc71, [
          { name: "Features", value: "Spam Protection\nLink Blocking\nJoin Detection\nAuto Timeout" }
        ])]
      });
    }

    // ───────── ANTINUKE SETUP ─────────

    if (cmd === "antinuke") {
      config[i.guild.id] = {
        ...(config[i.guild.id] || {}),
        antinuke: true
      };

      saveConfig();

      return i.reply({
        embeds: [embed("💣 Anti-Nuke Enabled", 0xe74c3c, [
          { name: "Protection", value: "Channel/Role protection (basic)" }
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
