process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcome = new Map();
const goodbye = new Map();
const raid = new Map();
const warns = new Map();
const commandRoles = new Map();
const autoroles = new Map();

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
// 👀 LIVE STATUS SYSTEM
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setActivity(
    `${client.guilds.cache.size} servers`,
    { type: 3 } // WATCHING
  );
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping bot"),
  new SlashCommandBuilder().setName("help").setDescription("📋 Help menu"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Say message")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
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
    .setDescription("⚠ Warn user")
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
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Clear messages")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Max 100")
        .setRequired(true)
    ),

  new SlashCommandBuilder().setName("lock").setDescription("🔒 Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 Unlock channel"),
  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set welcome")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("👋 Set goodbye")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡 Raid mode")
    .addBooleanOption(o =>
      o.setName("toggle")
        .setDescription("On/Off")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Command roles")
    .addStringOption(o =>
      o.setName("command")
        .setDescription("Command")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("⚙ Autorole system")
    .addSubcommand(s =>
      s.setName("set")
        .setDescription("Set role")
        .addRoleOption(o =>
          o.setName("role")
            .setDescription("Role")
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("remove")
        .setDescription("Remove role")
    )

].map(c => c.toJSON());

// ─────────────────────────────
// 🚀 GLOBAL COMMAND REGISTER (FIXED)
// ─────────────────────────────

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    if (!client.application?.id) return;

    console.log("🔄 Registering slash commands globally...");

    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: commands }
    );

    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("❌ Command error:", err);
  }
}

// ─────────────────────────────
// READY EVENT
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await new Promise(r => setTimeout(r, 2000));

  await registerCommands();

  updateStatus();

  console.log(`👀 Watching ${client.guilds.cache.size} servers`);
});

// ─────────────────────────────
// LIVE STATUS UPDATES
// ─────────────────────────────

client.on("guildCreate", () => updateStatus());
client.on("guildDelete", () => updateStatus());

// ─────────────────────────────
// AUTOROLE
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const roleId = autoroles.get(member.guild.id);
  if (!roleId) return;

  const role = member.guild.roles.cache.get(roleId);
  if (!role) return;

  member.roles.add(role).catch(() => {});
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
