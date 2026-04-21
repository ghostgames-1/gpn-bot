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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─────────────────────────────
// STORAGE
// ─────────────────────────────

const welcome = new Map();
const goodbye = new Map();
const warns = new Map();
const raid = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),

  new SlashCommandBuilder().setName("help").setDescription("Commands list"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Owner message sender")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount").setRequired(true)
    ),

  new SlashCommandBuilder().setName("lock").setDescription("Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock channel"),

  new SlashCommandBuilder().setName("ticket").setDescription("Create ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Set welcome channel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("Set goodbye channel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Toggle raid protection")
    .addBooleanOption(o =>
      o.setName("toggle").setDescription("true/false").setRequired(true)
    )
].map(c => c.toJSON());

// ─────────────────────────────
// READY (GUILD ONLY + CLEAR GLOBAL)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    // 🔥 DELETE ALL GLOBAL COMMANDS (THIS FIXES DUPLICATES)
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: [] }
    );

    console.log("Cleared global commands");

    // ✅ REGISTER ONLY GUILD COMMANDS
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );

      console.log(`Synced commands to: ${guild.name}`);
    }

  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// COMMAND HANDLER
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  if (commandName === "ping") return i.reply("🏓 Pong!");

  if (commandName === "help") {
    return i.reply({
      content:
        "/ping /help /say /kick /ban /timeout /warn /warnings /clear /lock /unlock /ticket /welcome /goodbye /raid"
    });
  }

  // ✅ OWNER ONLY /SAY
  if (commandName === "say") {
    if (!guild || member.id !== guild.ownerId) {
      return i.reply({ content: "Owner only", ephemeral: true });
    }

    const msg = i.options.getString("message");

    await i.reply({ content: "Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("Not found");

    await m.kick();
    return i.reply("Kicked");
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("Not found");

    await m.ban();
    return i.reply("Banned");
  }

  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const mins = i.options.getInteger("minutes");

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("Not found");

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
    return i.reply(`${user.tag}: ${(warns.get(user.id) || []).length}`);
  }

  if (commandName === "clear") {
    const amount = i.options.getInteger("amount");
    await i.channel.bulkDelete(amount, true);
    return i.reply({ content: "Deleted", ephemeral: true });
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

    return i.reply({ content: `Created: ${ch}`, ephemeral: true });
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
    return i.reply(`Raid: ${toggle ? "ON" : "OFF"}`);
  }
});

// ─────────────────────────────
// EVENTS
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
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
