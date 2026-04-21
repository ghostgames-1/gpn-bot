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
const commandRoles = new Map();

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commandNames = [
  "ping","help","say","kick","ban","timeout","warn","warnings",
  "clear","lock","unlock","ticket","welcome","goodbye","raid","setcommandroles"
];

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
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("🔒 Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 Unlock channel"),

  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create support ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set welcome channel")
    .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("👋 Set goodbye channel")
    .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡️ Toggle raid protection")
    .addBooleanOption(o => o.setName("toggle").setDescription("On/Off").setRequired(true)),

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
// REGISTER COMMANDS (FIXED)
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("Clearing global commands...");
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );

    console.log("Registering guild commands...");
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`✔ Synced: ${guild.name}`);
    }

    console.log("✅ Commands ready");

  } catch (err) {
    console.error("❌ REGISTER ERROR:", err);
  }
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

  // SELECT MENU
  if (i.isStringSelectMenu()) {
    const cmd = i.customId.replace("roles_", "");
    commandRoles.set(cmd, i.values);

    return i.reply({ content: `✅ Roles set for /${cmd}`, ephemeral: true });
  }

  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  // ROLE CHECK
  if (!hasCommandPermission(member, commandName)) {
    return i.reply({ content: "❌ No permission", ephemeral: true });
  }

  // PING
  if (commandName === "ping") return i.reply("🏓 Pong!");

  // HELP
  if (commandName === "help") {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 Commands")
          .setColor(0x5865F2)
          .setDescription(commandNames.map(c => `/${c}`).join("\n"))
      ]
    });
  }

  // SAY (OWNER ONLY)
  if (commandName === "say") {
    if (guild.ownerId !== i.user.id)
      return i.reply({ content: "❌ Owner only", ephemeral: true });

    const msg = i.options.getString("message");
    await i.reply({ content: "✅ Sent", ephemeral: true });
    return i.channel.send(msg);
  }

  // SAFE MEMBER FETCH
  const getMember = async (id) =>
    await guild.members.fetch(id).catch(() => null);

  // KICK
  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await getMember(i.options.getUser("user").id);
    if (!m) return i.reply("User not found");

    await m.kick();
    return i.reply("👢 Kicked");
  }

  // BAN
  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return i.reply({ content: "No permission", ephemeral: true });

    const m = await getMember(i.options.getUser("user").id);
    if (!m) return i.reply("User not found");

    await m.ban();
    return i.reply("🔨 Banned");
  }

  // TIMEOUT
  if (commandName === "timeout") {
    const m = await getMember(i.options.getUser("user").id);
    if (!m) return i.reply("User not found");

    const mins = i.options.getInteger("minutes");
    await m.timeout(mins * 60000);
    return i.reply(`⏳ Tim
