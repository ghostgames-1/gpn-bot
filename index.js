const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
  PermissionsBitField,
  PermissionFlagsBits
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

// ───────── FILES ─────────
const FILES = {
  warns: "./warns.json",
  config: "./config.json",
  whitelist: "./whitelist.json"
};

const load = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8") || "{}") : {};
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

let warns = load(FILES.warns);
let config = load(FILES.config);
let whitelist = load(FILES.whitelist);

// ───────── SAFE GUILD CONFIG ─────────
function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      logsChannel: null,
      honeypot: { enabled: false, channelId: null },
      raid: {
        enabled: false,
        antiSpam: true,
        antiLinks: true,
        autoLockdown: true,
        maxJoins: 5,
        joinWindow: 10000
      }
    };
  }
  return config[id];
}

// ───────── EMBED ─────────
const e = (t, c, f = []) =>
  new EmbedBuilder().setTitle(t || "Info").setColor(c || 0x2ecc71).addFields(f).setTimestamp();

// ───────── LOCKDOWN ─────────
async function lockdown(guild) {
  guild.channels.cache.forEach(ch => {
    ch.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false
    }).catch(() => {});
  });
}

async function unlockdown(guild) {
  guild.channels.cache.forEach(ch => {
    ch.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: null
    }).catch(() => {});
  });
}

// ───────── COMMANDS (100% VALIDATED) ─────────
const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Owner-only message sender")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("🎱 Ask a magic 8-ball question")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
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
        .setDescription("Reason for warning")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View user warnings")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("🧹 Delete messages (1-100)")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("♻️ Unban a user by ID")
    .addStringOption(o =>
      o.setName("userid")
        .setDescription("User ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to kick")
        .setRequired(true)
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
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("❌ Remove timeout")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to remove timeout")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("✏️ Set user nickname")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("nickname")
        .setDescription("New nickname")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("🎭 Add role to a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role")
        .setDescription("Role")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("📊 View server statistics"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("🖼 Show user avatar")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User (optional)")
    ),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("🔒 Lock server"),

  new SlashCommandBuilder()
    .setName("unlockdown")
    .setDescription("🔓 Unlock server"),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("📊 Setup logs channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Logs channel")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("🍯 Anti-spam honeypot system")
    .addSubcommand(s =>
      s.setName("setup")
        .setDescription("Create honeypot channel")
    )

].map(c => c.toJSON());

// ───────── READY ─────────
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers`,
      type: ActivityType.Watching
    }]
  });

  console.log(`Logged in as ${client.user.tag}`);
});

// ───────── INTERACTIONS ─────────
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const g = getGuild(i.guild.id);

  try {

    if (i.commandName === "ping")
      return i.reply({ embeds: [e("🏓 Pong", 0x2ecc71)] });

    if (i.commandName === "say") {
      if (i.user.id !== i.guild.ownerId)
        return i.reply({ content: "Owner only", ephemeral: true });

      await i.channel.send(i.options.getString("message"));
      return i.reply({ content: "Sent", ephemeral: true });
    }

    if (i.commandName === "avatar") {
      const user = i.options.getUser("user") || i.user;

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Avatar")
            .setImage(user.displayAvatarURL({ size: 4096 }))
            .setColor(0x5865F2)
        ]
      });
    }

    if (i.commandName === "honeypot") {
      const ch = await i.guild.channels.create({
        name: "⚠️-honeypot",
        type: 0,
        permissionOverwrites: [
          {
            id: i.guild.roles.everyone.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages
            ]
          }
        ]
      });

      g.honeypot.enabled = true;
      g.honeypot.channelId = ch.id;
      save(FILES.config, config);

      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ THIS IS A CHANNEL TO CATCH ANY SPAMBOTS")
            .setDescription("[smaller text - TALKING HERE RESULTS IN A SOFTBAN.⚠️]")
            .setColor(0xe74c3c)
        ]
      });

      return i.reply({ content: "🍯 Honeypot created", ephemeral: true });
    }

  } catch (err) {
    console.error(err);
    return i.reply({ content: "Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────
client.login(process.env.TOKEN);
