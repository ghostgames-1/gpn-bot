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
const raid = new Map();
const warns = new Map();

// ─────────────────────────────
// SLASH COMMANDS (FIXED VALIDATION)
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all commands"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to kick")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .addStringOption(o =>
      o.setName("userid")
        .setDescription("User ID to unban")
        .setRequired(true)
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
    .setDescription("Check warnings of a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock this channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock this channel"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a support ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Set welcome channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel for welcome messages")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("Set goodbye channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel for goodbye messages")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Enable or disable raid protection")
    .addBooleanOption(o =>
      o.setName("toggle")
        .setDescription("True = ON, False = OFF")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// READY (SAFE REGISTRATION)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: commands }
    );

    console.log("Slash commands synced");
  } catch (err) {
    console.error("Command sync error:", err);
  }
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  if (commandName === "ping") return i.reply("🏓 Pong!");

  if (commandName === "help") {
    return i.reply("/kick /ban /unban /timeout /warn /warnings /clear /lock /unlock /ticket /welcome /goodbye /raid");
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("Kicked");
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("Banned");
  }

  if (commandName === "unban") {
    try {
      await guild.bans.remove(i.options.getString("userid"));
      return i.reply("Unbanned");
    } catch {
      return i.reply("Failed to unban user");
    }
  }

  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const mins = i.options.getInteger("minutes");

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.timeout(mins * 60000);
    return i.reply("Timed out");
  }

  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply(`${user.tag} warned`);
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    return i.reply(`${user.tag}: ${(warns.get(user.id) || []).length} warnings`);
  }

  if (commandName === "clear") {
    const amount = i.options.getInteger("amount");
    await i.channel.bulkDelete(amount, true);
    return i.reply({ content: "Deleted messages", ephemeral: true });
  }

  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false
    });
    return i.reply("Locked");
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: true
    });
    return i.reply("Unlocked");
  }

  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ content: `Ticket created: ${ch}`, ephemeral: true });
  }

  if (commandName === "welcome") {
    const ch = i.options.getChannel("channel");
    welcome.set(guild.id, ch.id);
    return i.reply("Welcome set");
  }

  if (commandName === "goodbye") {
    const ch = i.options.getChannel("channel");
    goodbye.set(guild.id, ch.id);
    return i.reply("Goodbye set");
  }

  if (commandName === "raid") {
    const toggle = i.options.getBoolean("toggle");
    raid.set(guild.id, toggle);
    return i.reply(`Raid protection: ${toggle ? "ON" : "OFF"}`);
  }
});

// ─────────────────────────────
// WELCOME / GOODBYE EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", m => {
  const ch = welcome.get(m.guild.id);
  if (!ch) return;
  m.guild.channels.cache.get(ch)?.send(`Welcome ${m.user.tag}`);
});

client.on("guildMemberRemove", m => {
  const ch = goodbye.get(m.guild.id);
  if (!ch) return;
  m.guild.channels.cache.get(ch)?.send(`${m.user.tag} left`);
});

// ─────────────────────────────
// LOGIN SAFETY
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
