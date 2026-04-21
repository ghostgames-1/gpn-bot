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
const warns = new Map();
const raidTracker = new Map();

// ─────────────────────────────
// COMMANDS
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
    .setDescription("Toggle raid protection")
    .addBooleanOption(o => o.setName("toggle").setRequired(true))
].map(c => c.toJSON());

// ─────────────────────────────
// READY (FIXED REGISTRATION)
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
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("Kicked");
  }

  // ── ban
  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("Banned");
  }

  // ── unban (FIXED)
  if (commandName === "unban") {
    try {
      await guild.bans.remove(i.options.getString("userid"));
      return i.reply("Unbanned");
    } catch {
      return i.reply("Failed to unban user");
    }
  }

  // ── timeout
  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const mins = i.options.getInteger("minutes");

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.timeout(mins * 60000);
    return i.reply("Timed out");
  }

  // ── warn
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

  // ── clear
  if (commandName === "clear") {
    const amt = i.options.getInteger("amount");
    await i.channel.bulkDelete(amt, true);
    return i.reply({ content: "Deleted messages", ephemeral: true });
  }

  // ── lock/unlock
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

  // ── welcome/goodbye
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

  // ── raid toggle
  if (commandName === "raid") {
    const toggle = i.options.getBoolean("toggle");
    raidTracker.set(guild.id, toggle);
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
// SAFE RAID PROTECTION
// ─────────────────────────────

client.on("guildMemberAdd", async member => {
  if (!raidTracker.get(member.guild.id)) return;

  const now = Date.now();
  const id = member.guild.id;

  if (!welcome.has(id)) welcome.set(id, []);

  const joins = welcome.get(id);
  joins.push(now);

  const recent = joins.filter(t => now - t < 10000);
  welcome.set(id, recent);

  if (recent.length > 5) {
    try {
      await member.guild.roles.everyone.setPermissions([]);
    } catch (err) {
      console.error("Raid protection error:", err);
    }
  }
});

// ─────────────────────────────
// LOGIN SAFETY
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
