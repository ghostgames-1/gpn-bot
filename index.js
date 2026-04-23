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
// STORAGE
// ─────────────────────────────

const warns = new Map();
const commandRoles = new Map();

// ─────────────────────────────
// EMBED
// ─────────────────────────────

function modEmbed(title, color, user, reason) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Reason", value: reason || "No reason provided" }
    )
    .setTimestamp();
}

// ─────────────────────────────
// STATUS
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setActivity(
    `${client.guilds.cache.size} servers`,
    { type: 3 }
  );
}

// ─────────────────────────────
// COMMAND LIST (FULL RESTORED SET)
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping bot"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Send a message as bot")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠ Warn a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Set roles allowed for commands")
    .addStringOption(o =>
      o.setName("command").setDescription("Command name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("🎱 Ask the magic 8-ball")
    .addStringOption(o =>
      o.setName("question").setDescription("Question").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER COMMANDS (GUILD ONLY SAFE)
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    await rest.put(
      Routes.applicationGuildCommands(client.application.id, guild.id),
      { body: commands }
    );

    console.log(`✅ Synced ${guild.id}`);
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

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);
});

// ─────────────────────────────
// INTERACTIONS (FULL POLISHED)
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // 🏓 PING
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // 📋 HELP
  if (commandName === "help") {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 Commands")
          .setColor(0x3498db)
          .setDescription(
            "/ping\n/say\n/ban\n/warn\n/warnings\n/timeout\n/8ball\n/setcommandroles"
          )
      ]
    });
  }

  // 📢 SAY
  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });

    const msg = i.options.getString("message");

    await i.channel.send(msg);

    return i.editReply("✅ Sent");
  }

  // 🔨 BAN
  if (commandName === "ban") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const reason = i.options.getString("reason") || "No reason";

      const m = await guild.members.fetch(user.id);
      await m.ban({ reason });

      return i.editReply({
        embeds: [modEmbed("Banned", 0xff0000, user, reason)]
      });

    } catch (err) {
      console.error(err);
      return i.editReply("❌ Failed to ban");
    }
  }

  // ⚠ WARN
  if (commandName === "warn") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.editReply({
      embeds: [modEmbed("Warned", 0xffff00, user, reason)]
    });
  }

  // 📊 WARNINGS
  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns.get(user.id) || [];

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Warnings")
          .setColor(0x3498db)
          .setDescription(list.length ? list.join("\n") : "None")
      ]
    });
  }

  // ⏳ TIMEOUT
  if (commandName === "timeout") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");
      const reason = i.options.getString("reason") || "No reason";

      const m = await guild.members.fetch(user.id);
      await m.timeout(mins * 60000, reason);

      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Timed Out")
            .setColor(0xffff00)
            .addFields(
              { name: "User", value: user.tag },
              { name: "Duration", value: `${mins} minutes` },
              { name: "Reason", value: reason }
            )
        ]
      });

    } catch (err) {
      console.error(err);
      return i.editReply("❌ Failed timeout");
    }
  }

  // 🎱 8BALL
  if (commandName === "8ball") {
    const answers = [
      "Yes", "No", "Maybe", "Absolutely", "Never",
      "Ask again", "Definitely", "I doubt it"
    ];

    const question = i.options.getString("question");
    const answer = answers[Math.floor(Math.random() * answers.length)];

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎱 8-Ball")
          .setColor(0x2ecc71)
          .addFields(
            { name: "Question", value: question },
            { name: "Answer", value: answer }
          )
      ]
    });
  }

  // 🔐 SET COMMAND ROLES (basic placeholder safe version)
  if (commandName === "setcommandroles") {
    const cmd = i.options.getString("command");

    return i.reply(`🔐 Role system set for **${cmd}** (system placeholder)`);
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
