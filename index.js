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

// ───────── CLIENT ─────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ───────── SAFETY NET ─────────

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── FILE DB ─────────

const CONFIG_FILE = "./config.json";
const WARN_FILE = "./warns.json";

let config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
let warns = fs.existsSync(WARN_FILE) ? JSON.parse(fs.readFileSync(WARN_FILE)) : {};

let served = 0;

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function saveWarns() {
  fs.writeFileSync(WARN_FILE, JSON.stringify(warns, null, 2));
}

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

// ───────── EMBED SYSTEM ─────────

const embed = (title, color, fields = []) => {
  const e = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (fields.length) e.addFields(fields);
  return e;
};

// ───────── STATUS ─────────

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

// ───────── SAFE REPLY ─────────

async function safeReply(i, data) {
  try {
    if (i.replied || i.deferred) return i.followUp(data);
    return i.reply(data);
  } catch (e) {
    console.error(e);
  }
}

// ───────── WIZARD UI ─────────

function raidButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("raid_on").setLabel("Enable").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("raid_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
  );
}

function nukeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nuke_on").setLabel("Enable").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("nuke_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
  );
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Ping bot"),
  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder().setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

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
    .setDescription("View warnings")
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
    .setDescription("Whitelist system")
    .addSubcommand(s => s.setName("add").addUserOption(o => o.setName("user").setRequired(true)))
    .addSubcommand(s => s.setName("remove").addUserOption(o => o.setName("user").setRequired(true))),

  new SlashCommandBuilder().setName("antiraid")
    .setDescription("AntiRaid setup")
    .addSubcommand(s => s.setName("setup")),

  new SlashCommandBuilder().setName("antinuke")
    .setDescription("AntiNuke setup")
    .addSubcommand(s => s.setName("setup"))

].map(c => c.toJSON());

// ───────── READY ─────────

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

// ───────── SECURITY ENGINE ─────────

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

// ───────── MESSAGE SECURITY ─────────

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

// ───────── ANTINUKE ─────────

async function punish(guild, id) {
  const g = getGuild(guild.id);
  if (!g.antinuke) return;
  if (g.whitelist.includes(id)) return;

  const m = await guild.members.fetch(id).catch(() => null);
  if (!m) return;

  await m.timeout(600000).catch(() => {});
}

// ───────── AUDIT PROTECTION ─────────

client.on("channelDelete", async ch => {
  const logs = await ch.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelDelete,
    limit: 1
  }).catch(() => null);

  const entry = logs?.entries.first();
  if (entry) punish(ch.guild, entry.executor.id);
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  served++;

  const g = i.guild;
  const member = await g.members.fetch(i.user.id).catch(() => null);
  if (!member) return;

  const reply = d => safeReply(i, d);

  const requirePerm = (perm) => {
    if (!member.permissions.has(perm))
      throw new Error("No permission");
  };

  try {

    // ───────── HELP ─────────
    if (i.commandName === "help")
      return reply({ embeds: [embed("Commands", 0x3498db)] });

    // ───────── ANTIRAID UI ─────────
    if (i.commandName === "antiraid")
      return reply({
        content: "AntiRaid Setup",
        components: [raidButtons()],
        ephemeral: true
      });

    // ───────── ANTINUKE UI ─────────
    if (i.commandName === "antinuke")
      return reply({
        content: "AntiNuke Setup",
        components: [nukeButtons()],
        ephemeral: true
      });

    // ───────── LOG SET ─────────
    if (i.commandName === "setlog") {
      getGuild(g.id).logChannel = i.options.getChannel("channel").id;
      saveConfig();
      return reply({ embeds: [embed("Logs set", 0x2ecc71)] });
    }

    // ───────── WHITELIST ─────────
    if (i.commandName === "whitelist") {
      const sub = i.options.getSubcommand();
      const user = i.options.getUser("user");

      const conf = getGuild(g.id);

      if (sub === "add") conf.whitelist.push(user.id);
      if (sub === "remove") conf.whitelist = conf.whitelist.filter(x => x !== user.id);

      saveConfig();
      return reply({ embeds: [embed("Whitelist updated", 0x3498db)] });
    }

    // ───────── MODERATION ─────────

    if (i.commandName === "kick") {
      requirePerm(PermissionsBitField.Flags.KickMembers);

      const u = i.options.getUser("user");
      const t = await g.members.fetch(u.id).catch(() => null);

      if (!t?.kickable)
        return reply({ content: "❌ Can't kick", ephemeral: true });

      await t.kick();
      return reply({ embeds: [embed("Kicked", 0xe67e22)] });
    }

    if (i.commandName === "ban") {
      requirePerm(PermissionsBitField.Flags.BanMembers);
      const u = i.options.getUser("user");

      await g.members.ban(u.id).catch(() => {});
      return reply({ embeds: [embed("Banned", 0xe74c3c)] });
    }

    if (i.commandName === "timeout") {
      requirePerm(PermissionsBitField.Flags.ModerateMembers);

      const u = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");

      const t = await g.members.fetch(u.id).catch(() => null);
      if (!t) return;

      await t.timeout(mins * 60000).catch(() => {});
      return reply({ embeds: [embed("Timed Out", 0xf1c40f)] });
    }

    if (i.commandName === "warn") {
      const u = i.options.getUser("user");
      const r = i.options.getString("reason");

      warns[u.id] ??= [];
      warns[u.id].push(r);
      saveWarns();

      return reply({ embeds: [embed("Warned", 0xf1c40f)] });
    }

    if (i.commandName === "warnings") {
      const u = i.options.getUser("user");

      return reply({
        embeds: [embed("Warnings", 0x3498db, [
          { name: u.tag, value: warns[u.id]?.join("\n") || "None" }
        ])]
      });
    }

    if (i.commandName === "purge") {
      const a = i.options.getInteger("amount");

      if (a < 1 || a > 100)
        return reply({ content: "❌ 1-100", ephemeral: true });

      await i.channel.bulkDelete(a, true).catch(() => {});
      return reply({ embeds: [embed("Purged", 0xe67e22)], ephemeral: true });
    }

    if (i.commandName === "addrole") {
      const u = i.options.getUser("user");
      const r = i.options.getRole("role");

      const t = await g.members.fetch(u.id).catch(() => null);

      if (!t || !r.editable)
        return reply({ content: "❌ Can't add role", ephemeral: true });

      await t.roles.add(r).catch(() => {});
      return reply({ embeds: [embed("Role added", 0x2ecc71)] });
    }

    if (i.commandName === "setnick") {
      const u = i.options.getUser("user");
      const n = i.options.getString("nickname");

      const t = await g.members.fetch(u.id).catch(() => null);

      if (!t || !t.manageable)
        return reply({ content: "❌ Can't edit", ephemeral: true });

      await t.setNickname(n).catch(() => {});
      return reply({ embeds: [embed("Nick updated", 0x3498db)] });
    }

    if (i.commandName === "antiraid") {
      getGuild(g.id).antiraid = true;
      saveConfig();
      return reply({ embeds: [embed("AntiRaid enabled", 0x2ecc71)] });
    }

    if (i.commandName === "antinuke") {
      getGuild(g.id).antinuke = true;
      saveConfig();
      return reply({ embeds: [embed("AntiNuke enabled", 0xe74c3c)] });
    }

  } catch (err) {
    console.error(err);
    return safeReply(i, { content: "❌ Error occurred", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
