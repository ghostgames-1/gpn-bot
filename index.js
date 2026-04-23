const fs = require("fs");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// DATABASE
// ─────────────────────────────

const DB_FILE = "./warns.json";
let warns = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(warns, null, 2));
}

// ─────────────────────────────
// STATUS
// ─────────────────────────────

function updateStatus() {
  client.user.setActivity(`${client.guilds.cache.size} servers`, { type: 3 });
}

// ─────────────────────────────
// EMBED BUILDER
// ─────────────────────────────

function createEmbed(title, color, fields = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Check latency"),

  new SlashCommandBuilder().setName("help").setDescription("View all commands"),

  new SlashCommandBuilder().setName("about").setDescription("Bot info"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send message")
    .addStringOption(o => o.setName("message").setRequired(true).setDescription("Message")),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true).setDescription("User"))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true).setDescription("User"))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true).setDescription("User"))
    .addIntegerOption(o => o.setName("minutes").setRequired(true).setDescription("Minutes"))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("Server stats"),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask a question")
    .addStringOption(o => o.setName("question").setRequired(true))

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    await rest.put(
      Routes.applicationGuildCommands(client.application.id, guild.id),
      { body: commands }
    );
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await client.application.fetch();
  await registerCommands();
  updateStatus();
});

// ─────────────────────────────
// ANTI RAID
// ─────────────────────────────

const joins = new Map();

client.on("guildMemberAdd", member => {
  const now = Date.now();
  const arr = joins.get(member.guild.id) || [];

  arr.push(now);

  const recent = arr.filter(t => now - t < 10000);
  joins.set(member.guild.id, recent);

  if (recent.length >= 5) {
    member.guild.channels.cache.forEach(ch => {
      if (ch.isTextBased()) {
        ch.send("🛡 Anti-raid triggered");
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

  if (commandName === "ping") {
    return i.reply({ embeds: [createEmbed("🏓 Pong", 0x2ecc71)] });
  }

  if (commandName === "help") {
    return i.reply({
      embeds: [createEmbed("Commands", 0x3498db, [
        { name: "General", value: "/ping /help /about /8ball" },
        { name: "Moderation", value: "/kick /ban /timeout /warn /warnings" },
        { name: "Other", value: "/say /analytics" }
      ])]
    });
  }

  if (commandName === "about") {
    return i.reply({
      embeds: [createEmbed("🤖 About Bot", 0x9b59b6, [
        { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Users", value: `${client.users.cache.size}`, inline: true },
        { name: "Version", value: "v1.0", inline: true }
      ])]
    });
  }

  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });
    await i.channel.send(i.options.getString("message"));
    return i.editReply({ embeds: [createEmbed("Sent", 0x2ecc71)] });
  }

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
        embeds: [createEmbed(commandName.toUpperCase(), 0xe67e22, [
          { name: "User", value: user.tag },
          { name: "Reason", value: reason }
        ])]
      });

    } catch (e) {
      return i.editReply({ embeds: [createEmbed("Error", 0xe74c3c)] });
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
      embeds: [createEmbed("Warned", 0xf1c40f, [
        { name: "User", value: user.tag },
        { name: "Reason", value: reason }
      ])]
    });
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns[user.id] || [];

    return i.reply({
      embeds: [createEmbed("Warnings", 0x3498db, [
        { name: user.tag, value: list.join("\n") || "None" }
      ])]
    });
  }

  if (commandName === "analytics") {
    return i.reply({
      embeds: [createEmbed("Analytics", 0x1abc9c, [
        { name: "Servers", value: `${client.guilds.cache.size}` },
        { name: "Users", value: `${client.users.cache.size}` }
      ])]
    });
  }

  if (commandName === "8ball") {
    const answers = ["Yes","No","Maybe","Definitely","Never"];
    return i.reply({
      embeds: [createEmbed("🎱 8Ball", 0x2ecc71, [
        { name: "Answer", value: answers[Math.floor(Math.random()*answers.length)] }
      ])]
    });
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) process.exit(1);
client.login(process.env.TOKEN);
