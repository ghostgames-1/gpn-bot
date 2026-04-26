const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AuditLogEvent
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ─────────────────────────────
// SAFETY NET (CRASH PREVENTION)
// ─────────────────────────────

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ─────────────────────────────
// DATABASE
// ─────────────────────────────

const CONFIG_FILE = "./config.json";
const WARN_FILE = "./warns.json";

let config = fs.existsSync(CONFIG_FILE)
  ? JSON.parse(fs.readFileSync(CONFIG_FILE))
  : {};

let warns = fs.existsSync(WARN_FILE)
  ? JSON.parse(fs.readFileSync(WARN_FILE))
  : {};

let served = 0;

const saveConfig = () =>
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

const saveWarns = () =>
  fs.writeFileSync(WARN_FILE, JSON.stringify(warns, null, 2));

function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      antinuke: false,
      whitelist: [],
      logChannel: null,
      linkBlock: true
    };
  }
  return config[id];
}

// ─────────────────────────────
// SAFE HELPERS (FIXES UNDEFINED ERRORS)
// ─────────────────────────────

function embed(t, c, f = []) {
  const e = new EmbedBuilder().setTitle(t).setColor(c).setTimestamp();
  if (f.length) e.addFields(f);
  return e;
}

function getUser(i, name) {
  const u = i.options.getUser(name);
  return u || null;
}

function getRole(i, name) {
  return i.options.getRole(name) || null;
}

async function resolveMember(guild, user) {
  if (!guild || !user) return null;
  return await guild.members.fetch(user.id).catch(() => null);
}

async function safeReply(i, data) {
  try {
    if (i.replied || i.deferred) return i.followUp(data);
    return i.reply(data);
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────
// STATUS SYSTEM
// ─────────────────────────────

function updateStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers | ${served} served`,
      type: ActivityType.Watching
    }],
    status: "online"
  });
}

// ─────────────────────────────
// SECURITY SYSTEM
// ─────────────────────────────

const joins = {};
const spam = {};

client.on("guildMemberAdd", async m => {
  const g = getGuild(m.guild.id);
  if (!g.antiraid) return;

  joins[m.guild.id] ??= [];
  joins[m.guild.id].push(Date.now());

  joins[m.guild.id] =
    joins[m.guild.id].filter(t => Date.now() - t < 10000);

  if (joins[m.guild.id].length >= 5) {
    await m.timeout(600000).catch(() => {});
  }
});

client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const g = getGuild(msg.guild.id);

  if (g.linkBlock && /(https?:\/\/)/.test(msg.content)) {
    await msg.delete().catch(() => {});
    await msg.member?.timeout(300000).catch(() => {});
  }

  spam[msg.author.id] ??= [];
  spam[msg.author.id].push(Date.now());

  spam[msg.author.id] =
    spam[msg.author.id].filter(t => Date.now() - t < 4000);

  if (spam[msg.author.id].length >= 6) {
    await msg.member?.timeout(300000).catch(() => {});
  }
});

// ─────────────────────────────
// COMMANDS REGISTER
// ─────────────────────────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Ping"),
  new SlashCommandBuilder().setName("help").setDescription("Help"),

  new SlashCommandBuilder().setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder().setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder().setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder().setName("warn")
    .setDescription("Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder().setName("warnings")
    .setDescription("Warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder().setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder().setName("addrole")
    .setDescription("Add role")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addRoleOption(o => o.setName("role").setRequired(true)),

  new SlashCommandBuilder().setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("nickname").setRequired(true)),

  new SlashCommandBuilder().setName("setlog")
    .setDescription("Set logs channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder().setName("whitelist")
    .setDescription("Whitelist")
    .addSubcommand(s => s.setName("add").addUserOption(o => o.setName("user").setRequired(true)))
    .addSubcommand(s => s.setName("remove").addUserOption(o => o.setName("user").setRequired(true))),

  new SlashCommandBuilder().setName("antiraid")
    .setDescription("AntiRaid setup"),

  new SlashCommandBuilder().setName("antinuke")
    .setDescription("AntiNuke setup")

].map(c => c.toJSON());

// ─────────────────────────────
// READY
// ─────────────────────────────

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  updateStatus();
  setInterval(updateStatus, 15000);

  console.log("✅ GPN ENTERPRISE BOT ONLINE");
});

// ─────────────────────────────
// INTERACTIONS (SAFE CORE)
// ─────────────────────────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (!i.guild || !i.member)
      return safeReply(i, { content: "❌ Guild only", ephemeral: true });

    served++;

    const guild = i.guild;
    const member = await guild.members.fetch(i.user.id).catch(() => null);
    if (!member)
      return safeReply(i, { content: "❌ Member error", ephemeral: true });

    const g = getGuild(guild.id);

    const requirePerm = (p) => {
      if (!member.permissions.has(p))
        throw new Error("No permission");
    };

    // ───────── HELP ─────────
    if (i.commandName === "help")
      return safeReply(i, { embeds: [embed("Commands", 0x3498db)] });

    // ───────── ANTIRAID ─────────
    if (i.commandName === "antiraid") {
      g.antiraid = true;
      saveConfig();
      return safeReply(i, { embeds: [embed("AntiRaid enabled", 0x2ecc71)] });
    }

    // ───────── ANTINUKE ─────────
    if (i.commandName === "antinuke") {
      g.antinuke = true;
      saveConfig();
      return safeReply(i, { embeds: [embed("AntiNuke enabled", 0xe74c3c)] });
    }

    // ───────── MODERATION ─────────

    if (i.commandName === "kick") {
      requirePerm(PermissionsBitField.Flags.KickMembers);

      const user = getUser(i, "user");
      const target = await resolveMember(guild, user);

      if (!target || !target.kickable)
        return safeReply(i, { content: "❌ Can't kick", ephemeral: true });

      await target.kick();
      return safeReply(i, { embeds: [embed("Kicked", 0xe67e22)] });
    }

    if (i.commandName === "ban") {
      requirePerm(PermissionsBitField.Flags.BanMembers);

      const user = getUser(i, "user");
      await guild.members.ban(user.id).catch(() => {});

      return safeReply(i, { embeds: [embed("Banned", 0xe74c3c)] });
    }

    if (i.commandName === "timeout") {
      requirePerm(PermissionsBitField.Flags.ModerateMembers);

      const user = getUser(i, "user");
      const mins = i.options.getInteger("minutes");

      const target = await resolveMember(guild, user);
      if (!target) return;

      await target.timeout(mins * 60000).catch(() => {});
      return safeReply(i, { embeds: [embed("Timed out", 0xf1c40f)] });
    }

    if (i.commandName === "warn") {
      const user = getUser(i, "user");
      const reason = i.options.getString("reason");

      warns[user.id] ??= [];
      warns[user.id].push(reason);
      saveWarns();

      return safeReply(i, { embeds: [embed("Warned", 0xf1c40f)] });
    }

    if (i.commandName === "warnings") {
      const user = getUser(i, "user");

      return safeReply(i, {
        embeds: [embed("Warnings", 0x3498db, [
          { name: user.tag, value: warns[user.id]?.join("\n") || "None" }
        ])]
      });
    }

    if (i.commandName === "purge") {
      const amount = i.options.getInteger("amount");

      if (amount < 1 || amount > 100)
        return safeReply(i, { content: "❌ 1-100 only", ephemeral: true });

      await i.channel.bulkDelete(amount, true).catch(() => {});
      return safeReply(i, { embeds: [embed("Purged", 0xe67e22)], ephemeral: true });
    }

    if (i.commandName === "addrole") {
      const user = getUser(i, "user");
      const role = getRole(i, "role");

      const target = await resolveMember(guild, user);

      if (!target || !role?.editable)
        return safeReply(i, { content: "❌ Cannot add role", ephemeral: true });

      await target.roles.add(role);
      return safeReply(i, { embeds: [embed("Role added", 0x2ecc71)] });
    }

    if (i.commandName === "setnick") {
      const user = getUser(i, "user");
      const nick = i.options.getString("nickname");

      const target = await resolveMember(guild, user);

      if (!target || !target.manageable)
        return safeReply(i, { content: "❌ Cannot change nick", ephemeral: true });

      await target.setNickname(nick).catch(() => {});
      return safeReply(i, { embeds: [embed("Nickname updated", 0x3498db)] });
    }

    if (i.commandName === "setlog") {
      const ch = i.options.getChannel("channel");
      g.logChannel = ch?.id || null;
      saveConfig();

      return safeReply(i, { embeds: [embed("Logs set", 0x2ecc71)] });
    }

    if (i.commandName === "whitelist") {
      const sub = i.options.getSubcommand();
      const user = getUser(i, "user");

      if (!user)
        return safeReply(i, { content: "❌ Invalid user", ephemeral: true });

      if (sub === "add")
        g.whitelist.push(user.id);

      if (sub === "remove")
        g.whitelist = g.whitelist.filter(x => x !== user.id);

      saveConfig();
      return safeReply(i, { embeds: [embed("Whitelist updated", 0x3498db)] });
    }

  } catch (err) {
    console.error(err);
    return safeReply(i, { content: "❌ Internal error", ephemeral: true });
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
