process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder
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
// COMMANDS (POLISHED)
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Check the bot's latency and response speed"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📋 View all available commands and features"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Make the bot send a message (Server Owner Only)")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("The message you want the bot to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Remove a member from the server")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("The user you want to kick")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Permanently ban a member")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("The user you want to ban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Temporarily mute a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("The user to timeout")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Duration of timeout in minutes")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Give a warning to a user")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to warn")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View a user's warning count")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check warnings for")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Delete multiple messages at once")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("🔒 Lock the current channel"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("🔓 Unlock the current channel"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Create a private support ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set the welcome channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel where welcome messages will be sent")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("🚪 Set the goodbye channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel where leave messages will be sent")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡️ Enable or disable raid protection")
    .addBooleanOption(o =>
      o.setName("toggle")
        .setDescription("Turn raid protection ON or OFF")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER (GUILD ONLY)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: [] }
    );

    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guild.id),
        { body: commands }
      );
    }

    console.log("Commands synced cleanly");
  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// INTERACTIONS (EMBED UI)
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  const success = (title, desc) =>
    new EmbedBuilder().setColor(0x57F287).setTitle(title).setDescription(desc);

  const error = (msg) =>
    new EmbedBuilder().setColor(0xED4245).setDescription(msg);

  if (commandName === "ping") {
    return i.reply({ embeds: [success("🏓 Pong!", "Bot is online and responsive")] });
  }

  if (commandName === "help") {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📋 Command List")
          .setDescription(
            "`/ping` `/help` `/say`\n" +
            "`/kick` `/ban` `/timeout`\n" +
            "`/warn` `/warnings`\n" +
            "`/clear` `/lock` `/unlock`\n" +
            "`/ticket` `/welcome` `/goodbye`\n" +
            "`/raid`"
          )
      ]
    });
  }

  // OWNER ONLY SAY
  if (commandName === "say") {
    if (!guild || member.id !== guild.ownerId)
      return i.reply({ embeds: [error("Owner only command")], ephemeral: true });

    const msg = i.options.getString("message");

    await i.reply({ content: "Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ embeds: [error("No permission")], ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply({ embeds: [error("User not found")] });

    await m.kick();
    return i.reply({ embeds: [success("👢 User Kicked", `${user.tag} removed`)] });
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ embeds: [error("No permission")], ephemeral: true });

    const user = i.options.getUser("user");
    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply({ embeds: [error("User not found")] });

    await m.ban();
    return i.reply({ embeds: [success("🔨 User Banned", `${user.tag} banned`)] });
  }

  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const mins = i.options.getInteger("minutes");

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply({ embeds: [error("User not found")] });

    await m.timeout(mins * 60000);
    return i.reply({ embeds: [success("⏳ Timeout", `${user.tag} for ${mins} minutes`)] });
  }

  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply({ embeds: [success("⚠️ Warning Issued", `${user.tag}\nReason: ${reason}`)] });
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const count = (warns.get(user.id) || []).length;

    return i.reply({ embeds: [success("📊 Warnings", `${user.tag}: ${count}`)] });
  }

  if (commandName === "clear") {
    const amount = i.options.getInteger("amount");
    await i.channel.bulkDelete(amount, true);
    return i.reply({ embeds: [success("🧹 Cleared", `${amount} messages deleted`)], ephemeral: true });
  }

  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return i.reply({ embeds: [success("🔒 Channel Locked", "Members cannot send messages")] });
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    return i.reply({ embeds: [success("🔓 Channel Unlocked", "Members can send messages")] });
  }

  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ embeds: [success("🎫 Ticket Created", `${ch}`)], ephemeral: true });
  }

  if (commandName === "welcome") {
    const ch = i.options.getChannel("channel");
    welcome.set(guild.id, ch.id);
    return i.reply({ embeds: [success("👋 Welcome Set", `${ch}`)] });
  }

  if (commandName === "goodbye") {
    const ch = i.options.getChannel("channel");
    goodbye.set(guild.id, ch.id);
    return i.reply({ embeds: [success("🚪 Goodbye Set", `${ch}`)] });
  }

  if (commandName === "raid") {
    const toggle = i.options.getBoolean("toggle");
    raid.set(guild.id, toggle);
    return i.reply({ embeds: [success("🛡️ Raid Protection", toggle ? "Enabled" : "Disabled")] });
  }
});

// ─────────────────────────────
// EVENTS
// ─────────────────────────────

client.on("guildMemberAdd", m => {
  const ch = welcome.get(m.guild.id);
  if (!ch) return;
  m.guild.channels.cache.get(ch)?.send(`👋 Welcome ${m}`);
});

client.on("guildMemberRemove", m => {
  const ch = goodbye.get(m.guild.id);
  if (!ch) return;
  m.guild.channels.cache.get(ch)?.send(`🚪 ${m.user.tag} left`);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.error("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
