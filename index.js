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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// STORAGE
const welcome = new Map();
const goodbye = new Map();
const raid = new Map();
const warns = new Map();
const commandRoles = new Map();

// COMMANDS
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("🏓 Check latency"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Commands list"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Owner only message")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Minutes").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn user")
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

  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create ticket"),

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

  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Restrict command to roles")
    .addStringOption(o =>
      o.setName("command").setDescription("Command name").setRequired(true)
    )

].map(c => c.toJSON());

// READY
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    const guildId = client.guilds.cache.first()?.id;
    if (!guildId) return console.log("⚠️ No guild found");

    // ❌ CLEAR GLOBAL (fix duplicates)
    await rest.put(
      Routes.applicationCommands(client.application.id),
      { body: [] }
    );

    // ✅ REGISTER ONLY ONE GUILD (NO CRASH)
    await rest.put(
      Routes.applicationGuildCommands(client.application.id, guildId),
      { body: commands }
    );

    console.log("✅ Commands synced (guild only)");
  } catch (err) {
    console.error(err);
  }
});

// PERMISSION CHECK
function hasPerm(member, cmd) {
  if (!commandRoles.has(cmd)) return true;
  return member.roles.cache.some(r => commandRoles.get(cmd).includes(r.id));
}

// INTERACTIONS
client.on("interactionCreate", async i => {

  // DROPDOWN
  if (i.isStringSelectMenu()) {
    const cmd = i.customId.replace("roles_", "");
    commandRoles.set(cmd, i.values);
    return i.reply({ content: `✅ Roles set for /${cmd}`, ephemeral: true });
  }

  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  if (!hasPerm(member, commandName)) {
    return i.reply({ content: "❌ No permission", ephemeral: true });
  }

  if (commandName === "ping") return i.reply("🏓 Pong!");

  if (commandName === "help") {
    return i.reply("Use / to view commands");
  }

  if (commandName === "say") {
    if (guild.ownerId !== i.user.id)
      return i.reply({ content: "Owner only", ephemeral: true });

    const msg = i.options.getString("message");
    await i.reply({ content: "Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(()=>null);
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("👢 Kicked");
  }

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await guild.members.fetch(i.options.getUser("user").id).catch(()=>null);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("🔨 Banned");
  }

  if (commandName === "timeout") {
    const m = await guild.members.fetch(i.options.getUser("user").id).catch(()=>null);
    if (!m) return i.reply("User not found");

    await m.timeout(i.options.getInteger("minutes") * 60000);
    return i.reply("⏳ Timed out");
  }

  if (commandName === "warn") {
    const u = i.options.getUser("user");
    if (!warns.has(u.id)) warns.set(u.id, []);
    warns.get(u.id).push(i.options.getString("reason"));
    return i.reply("⚠️ Warned");
  }

  if (commandName === "warnings") {
    const u = i.options.getUser("user");
    return i.reply(`Warnings: ${(warns.get(u.id) || []).length}`);
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

    const roles = guild.roles.cache.map(r => ({
      label: r.name,
      value: r.id
    })).slice(0, 25); // FIX LIMIT

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

// EVENTS
client.on("guildMemberAdd", m => {
  const ch = welcome.get(m.guild.id);
  if (ch) m.guild.channels.cache.get(ch)?.send(`👋 Welcome ${m.user.tag}`);
});

client.on("guildMemberRemove", m => {
  const ch = goodbye.get(m.guild.id);
  if (ch) m.guild.channels.cache.get(ch)?.send(`${m.user.tag} left`);
});

// LOGIN
if (!process.env.TOKEN) {
  console.error("❌ TOKEN missing");
  process.exit(1);
}

client.login(process.env.TOKEN);
