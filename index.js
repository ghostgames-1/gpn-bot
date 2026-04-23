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
// STORAGE
// ─────────────────────────────

const warns = new Map();

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
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Make the bot say something")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
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
    .setName("8ball")
    .setDescription("🎱 Ask the magic 8-ball a question")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (SAFE GUILD ONLY)
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
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild } = i;

  // 🏓 PING
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // 📢 SAY
  if (commandName === "say") {
    await i.deferReply({ ephemeral: true });

    const msg = i.options.getString("message");

    await i.channel.send(msg);

    return i.editReply("✅ Message sent");
  }

  // ⏳ TIMEOUT
  if (commandName === "timeout") {
    await i.deferReply();

    try {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");
      const reason = i.options.getString("reason") || "No reason";

      const member = await guild.members.fetch(user.id);

      await member.timeout(mins * 60000, reason);

      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏳ Timed Out")
            .setColor(0xffff00)
            .addFields(
              { name: "User", value: `${user.tag}` },
              { name: "Duration", value: `${mins} minutes` },
              { name: "Reason", value: reason }
            )
            .setTimestamp()
        ]
      });

    } catch (err) {
      console.error(err);
      return i.editReply("❌ Failed to timeout user");
    }
  }

  // 🎱 8BALL
  if (commandName === "8ball") {
    const responses = [
      "Yes.",
      "No.",
      "Maybe.",
      "Absolutely.",
      "Not a chance.",
      "Ask again later.",
      "Definitely.",
      "I don’t think so.",
      "It is certain.",
      "Very doubtful."
    ];

    const question = i.options.getString("question");
    const answer = responses[Math.floor(Math.random() * responses.length)];

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
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
