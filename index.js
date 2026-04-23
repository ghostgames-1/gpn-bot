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
  PermissionsBitField
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// DATABASE (WARNS)
// ─────────────────────────────

const DB_FILE = "./warns.json";
let warns = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ─────────────────────────────
// EMBED
// ─────────────────────────────

function embed(title, color, fields = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();
}

// ─────────────────────────────
// STATUS
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;
  client.user.setActivity(`${client.guilds.cache.size} servers`, {
    type: 3
  });
}

// ─────────────────────────────
// COMMANDS (ALL VALID)
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands"),

  new SlashCommandBuilder()
    .setName("about")
    .setDescription("Show bot info"),

  new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("View server analytics"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message")
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
        .setDescription("Reason for kick")
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
        .setDescription("Reason for ban")
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
        .setDescription("Reason for timeout")
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
        .setDescription("Reason for warning")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View user warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (GUILD ONLY SAFE)
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await client.application.fetch();

  console.log("📦 Registering commands:");
  console.log(commands.map(c => c.name));

  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );
      console.log(`✅ Synced ${guild.id}`);
    } catch (err) {
      console.error(`❌ Failed ${guild.id}`, err);
    }
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  updateStatus();

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);
});

// ─────────────────────────────
// ANTI RAID
// ─────────────────────────────

const joinMap = new Map();

client.on("guildMemberAdd", member => {
  const now = Date.now();
  const arr = joinMap.get(member.guild.id) || [];

  arr.push(now);
  const recent = arr.filter(t => now - t < 10000);
  joinMap.set(member.guild.id, recent);

  if (recent.length >= 5) {
    member.guild.channels.cache.forEach(ch => {
      if (ch.isTextBased()) {
        ch.send("🛡 Anti-raid triggered: too many joins");
      }
    });
  }
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // ─ BASIC ─

  if (commandName === "ping") {
    return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });
  }

  if (commandName === "help") {
    return i.reply({
      embeds: [embed("📋 Commands", 0x3498db, [
        { name: "General", value: "/ping /help /about /8ball" },
        { name: "Moderation", value: "/kick /ban /timeout /warn /warnings" },
        { name: "Other", value: "/say /analytics" }
      ])]
    });
  }

  if (commandName === "about") {
    return i.reply({
      embeds: [embed("🤖 About Bot", 0x9b59b6, [
        { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Users", value: `${client.users.cache.size}`, inline: true },
        { name: "Version", value: "v1.0", inline: true }
      ])]
    });
  }

  if (commandName === "analytics") {
    return i.reply({
      embeds: [embed("📊 Analytics", 0x1abc9c, [
        { name: "Servers", value: `${client.guilds.cache.size}` },
        { name: "Users", value: `${client.users.cache.size}` }
      ])]
    });
  }

  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply({ embeds: [embed("✅ Sent", 0x2ecc71)] });
  }

  // ─ MODERATION ─

  if (["kick","ban","timeout"].includes(commandName)) {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";
      const member = await guild.members.fetch(user.id);

      if (commandName === "kick") await member.kick(reason);
      if (commandName === "ban") await member.ban({ reason });
      if (commandName === "timeout") {
        const mins = i.options.getInteger("minutes");
        await member.timeout(mins * 60000, reason);
      }

      return i.editReply({
        embeds: [embed(`✅ ${commandName.toUpperCase()}`, 0xe67e22, [
          { name: "User", value: user.tag },
          { name: "Reason", value: reason }
        ])]
      });

    } catch (e) {
      console.error(e);
      return i.editReply({ embeds: [embed("❌ Error", 0xe74c3c)] });
    }
  }

  if (commandName === "warn") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns[user.id]) warns[user.id] = [];
    warns[user.id].push(reason);
    saveDB();

    return i.editReply({
      embeds: [embed("⚠ Warned", 0xf1c40f, [
        { name: "User", value: user.tag },
        { name: "Reason", value: reason }
      ])]
    });
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns[user.id] || [];

    return i.reply({
      embeds: [embed("📊 Warnings", 0x3498db, [
        { name: user.tag, value: list.join("\n") || "None" }
      ])]
    });
  }

  if (commandName === "8ball") {
    const answers = ["Yes","No","Maybe","Definitely","Never"];
    return i.reply({
      embeds: [embed("🎱 8Ball", 0x2ecc71, [
        { name: "Answer", value: answers[Math.floor(Math.random()*answers.length)] }
      ])]
    });
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
