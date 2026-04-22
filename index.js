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

const warns = new Map();
const autoroles = new Map();
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
// 👀 LIVE STATUS
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setActivity(
    `${client.guilds.cache.size} servers`,
    { type: 3 }
  );
}

// ─────────────────────────────
// COMMANDS (GUILD ONLY)
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping bot"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠ Warn user")
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
    .setName("clear")
    .setDescription("🧹 Clear messages")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Max 100").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// 🚀 REGISTER (GUILD ONLY + NO DUPES)
// ─────────────────────────────

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    const guilds = await client.guilds.fetch();

    for (const [, guild] of guilds) {

      // 🧹 CLEAR OLD COMMANDS FIRST (FIX DUPLICATES)
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: [] }
      );

      // ➕ ADD CLEAN COMMANDS
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );

      console.log(`✅ Synced & cleaned ${guild.id}`);
    }

  } catch (err) {
    console.error("Command error:", err);
  }
}

// ─────────────────────────────
// READY
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

client.on("guildCreate", updateStatus);
client.on("guildDelete", updateStatus);

// ─────────────────────────────
// INTERACTIONS (FIXED “FAILED TO INTERACT”)
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  // 🏓 PING
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // 👢 KICK
  if (commandName === "kick") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason") || "No reason";

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.editReply("User not found");

    await m.kick(reason);

    return i.editReply({
      embeds: [modEmbed("Kicked", 0xffa500, user, reason)]
    });
  }

  // 🔨 BAN
  if (commandName === "ban") {
    await i.deferReply();

    const user = i.options.getUser("user");
    const reason = i.options.getString("reason") || "No reason";

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.editReply("User not found");

    await m.ban({ reason });

    return i.editReply({
      embeds: [modEmbed("Banned", 0xff0000, user, reason)]
    });
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

  // 🧹 CLEAR
  if (commandName === "clear") {
    await i.deferReply();

    const amt = Math.min(i.options.getInteger("amount"), 100);
    await i.channel.bulkDelete(amt, true);

    return i.editReply("🧹 Cleared messages");
  }
});

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
