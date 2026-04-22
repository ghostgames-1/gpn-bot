process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
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

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Make the bot say something (owner only)")
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
    .setName("warn")
    .setDescription("⚠️ Warn a user")
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
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount").setRequired(true)
    ),

  new SlashCommandBuilder().setName("lock").setDescription("🔒 Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 Unlock channel"),

  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create ticket"),

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

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡️ Toggle raid protection")
    .addBooleanOption(o =>
      o.setName("toggle").setDescription("On/Off").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Set roles allowed for a command")
    .addStringOption(o =>
      o.setName("command").setDescription("Command name").setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER COMMANDS (FIXED)
// ─────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    const guilds = await client.guilds.fetch();

    for (const [, guild] of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`Synced: ${guild.id}`);
    }

  } catch (err) {
    console.error("Register error:", err);
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ✅ Auto register when bot joins new server
client.on("guildCreate", async () => {
  await registerCommands();
});

// ─────────────────────────────
// PERMISSION CHECK
// ─────────────────────────────

function hasCommandPermission(member, command) {
  if (!commandRoles.has(command)) return true;
  const allowed = commandRoles.get(command);
  return member.roles.cache.some(r => allowed.includes(r.id));
}

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {

  // ROLE SELECT MENU
  if (i.isStringSelectMenu()) {
    const cmd = i.customId.replace("roles_", "");
    commandRoles.set(cmd, i.values);
    return i.reply({ content: `✅ Roles set for /${cmd}`, ephemeral: true });
  }

  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  if (!hasCommandPermission(member, commandName)) {
    return i.reply({ content: "❌ No permission", ephemeral: true });
  }

  if (commandName === "ping") return i.reply("🏓 Pong!");

  if (commandName === "help") {
    return i.reply("Use slash commands from the menu");
  }

  // SAY (OWNER ONLY)
  if (commandName === "say") {
    if (guild.ownerId !== i.user.id) {
      return i.reply({ content: "❌ Owner only", ephemeral: true });
    }

    const msg = i.options.getString("message");

    await i.reply({ content: "✅ Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("👢 Kicked");
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("🔨 Banned");
  }

  if (commandName === "timeout") {
    const m = await guild.members.fetch(i.options.getUser("user").id);
    const mins = i.options.getInteger("minutes");

    await m.timeout(mins * 60000);
    return i.reply(`⏳ ${mins}m timeout`);
  }

  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply(`⚠️ Warned`);
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    return i.reply(`${(warns.get(user.id) || []).length} warnings`);
  }

  if (commandName === "clear") {
    await i.channel.bulkDelete(i.options.getInteger("amount"), true);
    return i.reply({ content: "🧹 Cleared", ephemeral: true });
  }

  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return i.reply("🔒 Locked");
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    return i.reply("🔓 Unlocked");
  }

  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ content: `🎫 ${ch}`, ephemeral: true });
  }

  if (commandName === "welcome") {
    welcome.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Welcome set");
  }

  if (commandName === "goodbye") {
    goodbye.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Goodbye set");
  }

  if (commandName === "raid") {
    raid.set(guild.id, i.options.getBoolean("toggle"));
    return i.reply("🛡️ Updated");
  }

  if (commandName === "setcommandroles") {
    const cmd = i.options.getString("command");

    const roles = guild.roles.cache
      .filter(r => r.name !== "@everyone")
      .map(r => ({ label: r.name, value: r.id }))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`roles_${cmd}`)
      .setPlaceholder("Select roles")
      .setMinValues(1)
      .setMaxValues(roles.length)
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    return i.reply({
      content: `Select roles for /${cmd}`,
      components: [row],
      ephemeral: true
    });
  }

});

// ─────────────────────────────
// EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", m => {
  const ch = welcome.get(m.guild.id);
  if (ch) m.guild.channels.cache.get(ch)?.send(`👋 Welcome ${m.user}`);
});

client.on("guildMemberRemove", m => {
  const ch = goodbye.get(m.guild.id);
  if (ch) m.guild.channels.cache.get(ch)?.send(`👋 ${m.user.tag} left`);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("❌ Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
