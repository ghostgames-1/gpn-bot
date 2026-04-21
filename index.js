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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcome = new Map();
const goodbye = new Map();
const raid = new Map();
const warns = new Map();
const commandRoles = new Map(); // NEW permission system

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Check bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Show all commands"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Make the bot say something (owner only)")
    .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick a user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban a user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout a user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn a user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("🔒 Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 Unlock channel"),

  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create support ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set welcome channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("👋 Set goodbye channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡️ Toggle raid protection")
    .addBooleanOption(o => o.setName("toggle").setRequired(true)),

  // 🔐 ROLE PERMISSION SYSTEM
  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Set roles allowed to use a command")
    .addStringOption(o =>
      o.setName("command")
        .setDescription("Command name")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (GUILD ONLY + CLEAR GLOBAL)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // ❌ REMOVE GLOBAL COMMANDS (fix duplicates)
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: [] }
    );

    // ✅ REGISTER PER GUILD (instant)
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );
      console.log(`Synced: ${guild.name}`);
    }

  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// PERMISSION CHECK
// ─────────────────────────────

function hasCommandPermission(member, command) {
  if (!commandRoles.has(command)) return true;

  const allowedRoles = commandRoles.get(command);
  return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {

  // ── ROLE DROPDOWN HANDLER
  if (i.isStringSelectMenu()) {
    const command = i.customId.replace("roles_", "");
    commandRoles.set(command, i.values);

    return i.reply({
      content: `✅ Roles set for /${command}`,
      ephemeral: true
    });
  }

  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  // 🔐 role restriction check
  if (!hasCommandPermission(member, commandName)) {
    return i.reply({ content: "❌ You can't use this command", ephemeral: true });
  }

  // ── ping
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // ── help
  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 Commands")
      .setColor(0x5865F2)
      .setDescription(
`/ping
/help
/say
/kick
/ban
/timeout
/warn
/warnings
/clear
/lock
/unlock
/ticket
/welcome
/goodbye
/raid
/setcommandroles`
      );

    return i.reply({ embeds: [embed] });
  }

  // ── SAY (OWNER ONLY + HIDDEN USER)
  if (commandName === "say") {
    if (i.guild.ownerId !== i.user.id) {
      return i.reply({ content: "❌ Owner only", ephemeral: true });
    }

    const msg = i.options.getString("message");

    await i.reply({ content: "✅ Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  // ── MODERATION
  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("👢 User kicked");
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("🔨 User banned");
  }

  if (commandName === "timeout") {
    const m = await guild.members.fetch(i.options.getUser("user").id);
    const mins = i.options.getInteger("minutes");

    await m.timeout(mins * 60000);
    return i.reply(`⏳ Timed out for ${mins}m`);
  }

  // ── WARN SYSTEM
  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply(`⚠️ ${user.tag} warned`);
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    return i.reply(`📊 ${user.tag}: ${(warns.get(user.id) || []).length} warnings`);
  }

  // ── CLEAR
  if (commandName === "clear") {
    const amt = i.options.getInteger("amount");
    await i.channel.bulkDelete(amt, true);
    return i.reply({ content: "🧹 Cleared", ephemeral: true });
  }

  // ── LOCK
  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return i.reply("🔒 Locked");
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    return i.reply("🔓 Unlocked");
  }

  // ── TICKET
  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ content: `🎫 ${ch}`, ephemeral: true });
  }

  // ── WELCOME / GOODBYE
  if (commandName === "welcome") {
    welcome.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Welcome set");
  }

  if (commandName === "goodbye") {
    goodbye.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Goodbye set");
  }

  // ── RAID
  if (commandName === "raid") {
    const toggle = i.options.getBoolean("toggle");
    raid.set(guild.id, toggle);
    return i.reply(`🛡️ Raid: ${toggle ? "ON" : "OFF"}`);
  }

  // ── ROLE SETUP UI
  if (commandName === "setcommandroles") {
    const cmd = i.options.getString("command");

    const roles = guild.roles.cache.map(r => ({
      label: r.name,
      value: r.id
    })).slice(0, 25);

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
  if (ch) m.guild.channels.cache.get(ch)?.send(`👋 Welcome ${m.user.tag}`);
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
