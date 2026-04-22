process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  EmbedBuilder
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
const autoroles = new Map();

// ─────────────────────────────
// EMBED HELPER
// ─────────────────────────────

function modEmbed(title, color, user, reason) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Reason", value: reason || "No reason provided" }
    )
    .setTimestamp();
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping"),
  new SlashCommandBuilder().setName("help").setDescription("📋 Help"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("📢 Say message (owner only)")
    .addStringOption(o => o.setName("message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠ Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Clear messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("🔒 Lock channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 Unlock channel"),

  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Create ticket"),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Set welcome")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("👋 Set goodbye")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("raid")
    .setDescription("🛡 Toggle raid")
    .addBooleanOption(o => o.setName("toggle").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setcommandroles")
    .setDescription("🔐 Command roles")
    .addStringOption(o => o.setName("command").setRequired(true)),

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("⚙ Autorole")
    .addSubcommand(s =>
      s.setName("set")
        .setDescription("Set role")
        .addRoleOption(o => o.setName("role").setRequired(true))
    )
    .addSubcommand(s =>
      s.setName("remove")
        .setDescription("Remove role")
    )

].map(c => c.toJSON());

// ─────────────────────────────
// REGISTER
// ─────────────────────────────

async function registerCommands() {
  if (!client.user) return;

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const guilds = await client.guilds.fetch();

  for (const [, guild] of guilds) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands }
    );
  }
}

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ─────────────────────────────
// AUTOROLE
// ─────────────────────────────

client.on("guildMemberAdd", member => {
  const roleId = autoroles.get(member.guild.id);
  if (!roleId) return;

  const role = member.guild.roles.cache.get(roleId);
  if (role) member.roles.add(role).catch(() => {});
});

// ─────────────────────────────
// PERMISSIONS
// ─────────────────────────────

function hasPermission(member, cmd) {
  if (!commandRoles.has(cmd)) return true;
  return member.roles.cache.some(r =>
    commandRoles.get(cmd).includes(r.id)
  );
}

// ─────────────────────────────
// COMMANDS
// ─────────────────────────────

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName, guild, member } = i;

  if (!hasPermission(member, commandName)) {
    return i.reply({ content: "❌ No permission", ephemeral: true });
  }

  // ─ BASIC ─

  if (commandName === "ping")
    return i.reply("🏓 Pong!");

  if (commandName === "help")
    return i.reply("Use slash commands.");

  if (commandName === "say") {
    if (guild.ownerId !== i.user.id)
      return i.reply({ content: "❌ Owner only", ephemeral: true });

    return i.channel.send(i.options.getString("message"));
  }

  // ─ MODERATION ─

  if (commandName === "kick") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason") || "No reason provided";

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.kick(reason);
    return i.reply({ embeds: [modEmbed("Kicked", 0xffa500, user, reason)] });
  }

  if (commandName === "ban") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason") || "No reason provided";

    const m = await guild.members.fetch(user.id).catch(() => null);
    if (!m) return i.reply("User not found");

    await m.ban({ reason });
    return i.reply({ embeds: [modEmbed("Banned", 0xff0000, user, reason)] });
  }

  if (commandName === "timeout") {
    const user = i.options.getUser("user");
    const mins = i.options.getInteger("minutes");
    const reason = i.options.getString("reason") || "No reason provided";

    const m = await guild.members.fetch(user.id);

    await m.timeout(mins * 60000, reason);

    const embed = new EmbedBuilder()
      .setTitle("Timed Out")
      .setColor(0xffff00)
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})` },
        { name: "Duration", value: `${mins} minutes` },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    return i.reply({ embeds: [embed] });
  }

  if (commandName === "warn") {
    const user = i.options.getUser("user");
    const reason = i.options.getString("reason");

    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push(reason);

    return i.reply({
      embeds: [modEmbed("Warned", 0xffff00, user, reason)]
    });
  }

  if (commandName === "warnings") {
    const user = i.options.getUser("user");
    const list = warns.get(user.id) || [];

    const embed = new EmbedBuilder()
      .setTitle("Warnings")
      .setColor(0x3498db)
      .setDescription(
        list.length ? list.map((w, i) => `${i + 1}. ${w}`).join("\n") : "None"
      )
      .addFields({ name: "Total", value: `${list.length}` });

    return i.reply({ embeds: [embed] });
  }

  if (commandName === "clear") {
    const amt = Math.min(i.options.getInteger("amount"), 100);
    await i.channel.bulkDelete(amt, true);
    return i.reply({ content: "🧹 Cleared", ephemeral: true });
  }

  if (commandName === "lock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false
    });
    return i.reply("🔒 Locked");
  }

  if (commandName === "unlock") {
    await i.channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: true
    });
    return i.reply("🔓 Unlocked");
  }

  if (commandName === "ticket") {
    const ch = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText
    });

    return i.reply({ content: `🎫 ${ch}`, ephemeral: true });
  }

  // ─ SETTINGS ─

  if (commandName === "welcome") {
    welcome.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Set");
  }

  if (commandName === "goodbye") {
    goodbye.set(guild.id, i.options.getChannel("channel").id);
    return i.reply("👋 Set");
  }

  if (commandName === "raid") {
    raid.set(guild.id, i.options.getBoolean("toggle"));
    return i.reply("🛡 Updated");
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
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    return i.reply({ content: "Select roles", components: [row], ephemeral: true });
  }

  // ─ AUTOROLE ─

  if (commandName === "autorole") {
    const sub = i.options.getSubcommand();

    if (sub === "set") {
      const role = i.options.getRole("role");
      autoroles.set(guild.id, role.id);
      return i.reply("Set");
    }

    if (sub === "remove") {
      autoroles.delete(guild.id);
      return i.reply("Removed");
    }
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

if (!process.env.TOKEN) {
  console.log("Missing TOKEN");
  process.exit(1);
}

client.login(process.env.TOKEN);
