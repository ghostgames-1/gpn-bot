process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType
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

const welcome = new Map();
const goodbye = new Map();
const warns = new Map();
const commandRoles = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Make the bot send a message (owner only)")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban a user")
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
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set welcome channel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("👋 Set goodbye channel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    ),

  // 🔐 ROLE SYSTEM (NO DROPDOWN = NO CRASH)
  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Restrict a command to roles")
    .addStringOption(o =>
      o.setName("command")
        .setDescription("Command name")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role1")
        .setDescription("Role 1")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role2")
        .setDescription("Role 2")
    )
    .addRoleOption(o =>
      o.setName("role3")
        .setDescription("Role 3")
    )

].map(c => c.toJSON());

// ─────────────────────────────
// READY (GUILD ONLY = NO DUPES)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // ❌ CLEAR GLOBAL COMMANDS (fix duplicates)
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: [] }
    );

    // ✅ REGISTER GUILD COMMANDS (instant)
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );
      console.log(`⚡ Synced: ${guild.name}`);
    }

  } catch (err) {
    console.error("❌ Command sync error:", err);
  }
});

// ─────────────────────────────
// PERMISSION SYSTEM
// ─────────────────────────────

function hasPermission(member, cmd) {
  if (!commandRoles.has(cmd)) return true;
  return member.roles.cache.some(r =>
    commandRoles.get(cmd).includes(r.id)
  );
}

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  // 🔐 role restriction
  if (!hasPermission(member, commandName)) {
    return i.reply({ content: "❌ No permission", ephemeral: true });
  }

  try {

    if (commandName === "ping")
      return i.reply("🏓 Pong!");

    if (commandName === "help")
      return i.reply("/ping /say /kick /ban /timeout /clear /welcome /goodbye /setcommandroles");

    // 📢 SAY (OWNER ONLY, HIDES USER)
    if (commandName === "say") {
      if (guild.ownerId !== i.user.id)
        return i.reply({ content: "❌ Owner only", ephemeral: true });

      const msg = i.options.getString("message");

      await i.reply({ content: "✅ Sent", ephemeral: true });
      return i.channel.send(msg);
    }

    // 👢 KICK
    if (commandName === "kick") {
      if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return i.reply({ content: "❌ No permission", ephemeral: true });

      const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
      if (!m) return i.reply("User not found");

      await m.kick().catch(() => {});
      return i.reply("👢 User kicked");
    }

    // 🔨 BAN
    if (commandName === "ban") {
      if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return i.reply({ content: "❌ No permission", ephemeral: true });

      const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
      if (!m) return i.reply("User not found");

      await m.ban().catch(() => {});
      return i.reply("🔨 User banned");
    }

    // ⏳ TIMEOUT
    if (commandName === "timeout") {
      if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return i.reply({ content: "❌ No permission", ephemeral: true });

      const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
      if (!m) return i.reply("User not found");

      await m.timeout(i.options.getInteger("minutes") * 60000).catch(() => {});
      return i.reply("⏳ Timed out");
    }

    // 🧹 CLEAR
    if (commandName === "clear") {
      const amt = i.options.getInteger("amount");
      await i.channel.bulkDelete(amt, true).catch(() => {});
      return i.reply({ content: "🧹 Cleared", ephemeral: true });
    }

    // 👋 WELCOME
    if (commandName === "welcome") {
      welcome.set(guild.id, i.options.getChannel("channel").id);
      return i.reply("👋 Welcome channel set");
    }

    // 👋 GOODBYE
    if (commandName === "goodbye") {
      goodbye.set(guild.id, i.options.getChannel("channel").id);
      return i.reply("👋 Goodbye channel set");
    }

    // 🔐 SET ROLES
    if (commandName === "setcommandroles") {
      const cmd = i.options.getString("command");

      const roles = [
        i.options.getRole("role1"),
        i.options.getRole("role2"),
        i.options.getRole("role3")
      ].filter(Boolean);

      commandRoles.set(cmd, roles.map(r => r.id));

      return i.reply({
        content: `✅ Roles set for /${cmd}`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error("❌ Command error:", err);
    if (!i.replied) {
      i.reply({ content: "Error occurred", ephemeral: true });
    }
  }
});

// ─────────────────────────────
// EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", m => {
  const ch = welcome.get(m.guild.id);
  const channel = m.guild.channels.cache.get(ch);
  if (channel) channel.send(`👋 Welcome ${m.user.tag}`);
});

client.on("guildMemberRemove", m => {
  const ch = goodbye.get(m.guild.id);
  const channel = m.guild.channels.cache.get(ch);
  if (channel) channel.send(`${m.user.tag} left`);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("❌ Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
