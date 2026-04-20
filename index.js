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
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcome = new Map();
const goodbye = new Map();
const warns = new Map();
const raid = new Map();

// ─────────────────────────────
// SLASH COMMANDS (NO DUPLICATES)
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),
  new SlashCommandBuilder().setName("help").setDescription("Commands list"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban user")
    .addStringOption(o => o.setName("userid").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Set welcome channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("Set goodbye channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Enable/disable raid protection")
    .addBooleanOption(o => o.setName("toggle").setRequired(true))
].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (FIXED DUPLICATE ISSUE)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // ALWAYS clear first → prevents duplicates
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("Slash commands synced cleanly");
  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// INTERACTIONS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  // ── ping
  if (commandName === "ping") {
    return i.reply("🏓 Pong!");
  }

  // ── help
  if (commandName === "help") {
    return i.reply("/kick /ban /unban /timeout /warn /warnings /clear /lock /unlock /ticket /welcome /goodbye /raid");
  }

  // ── kick
  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("Not found");

    await m.kick();
    return i.reply("Kicked");
  }

  // ── ban
  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("Not found");

    await m.ban();
    return i.reply("Banned");
  }

  // ── unban
  if (commandName === "unban") {
    await guild.members.unban(i.options.getString("userid"));
    return i.reply("Unbanned");
  }

  // ── timeout
  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id);
    const mins = i.options.getInteger("minutes");

    await m.timeout(mins * 60000);
    return i.reply("Timed out");
  }

  // ── warn system
  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply(`${user.tag} warned`);
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    return i.reply(`${user.tag} warnings: ${(warns.get(user.id) || []).length}`);
  }

  // ── clear
  if (commandName === "clear") {
    const amt = i.options.getInteger("amount");
    await i.channel.bulkDelete(amt, true);
    return i.reply({ content: "Deleted messages", ephemeral: true });
  }

  // ── lock/unlock
  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return i.reply("Locked");
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    return i.reply("Unlocked");
  }

  // ── welcome
  if (commandName === "welcome") {
    const ch = i.options.getChannel("channel");
    welcome.set(guild.id, ch.id);
    return i.reply("Welcome set");
  }

  // ── goodbye
  if (commandName === "goodbye") {
    const ch = i.options.getChannel("channel");
    goodbye.set(guild.id, ch.id);
    return i.reply("Goodbye set");
  }

  // ── raid toggle
  if (commandName === "raid") {
    const toggle = i.options.getBoolean("toggle");
    raid.set(guild.id, toggle);
    return i.reply(`Raid protection: ${toggle ? "ON" : "OFF"}`);
  }

  // ── ticket
  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ content: `Ticket created: ${ch}`, ephemeral: true });
  }
});

// ─────────────────────────────
// WELCOME / GOODBYE
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
// SIMPLE RAID PROTECTION
// ─────────────────────────────

client.on("guildMemberAdd", async member => {
  if (!raid.get(member.guild.id)) return;

  const recent = Date.now();
  const key = member.guild.id;

  if (!welcome.has(key)) welcome.set(key, []);

  const joins = welcome.get(key);
  joins.push(recent);

  const filtered = joins.filter(t => recent - t < 10000);
  welcome.set(key, filtered);

  if (filtered.length > 5) {
    member.guild.roles.everyone.setPermissions([]);
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
