const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  AuditLogEvent
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── DATABASE ─────────

const DB_FILE = "./config.json";
const WARN_FILE = "./warns.json";

let config = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let warns = fs.existsSync(WARN_FILE) ? JSON.parse(fs.readFileSync(WARN_FILE)) : {};

let served = 0;

const saveConfig = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(config, null, 2));

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

// ───────── EMBED ─────────

const embed = (t, c, f = []) => {
  const e = new EmbedBuilder().setTitle(t).setColor(c).setTimestamp();
  if (f.length) e.addFields(f);
  return e;
};

// ───────── STATUS ─────────

function updateStatus() {
  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers | ${served} served`,
      type: ActivityType.Watching
    }]
  });
}

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Ping"),
  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder().setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder().setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

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
    .setDescription("Setup anti raid")
    .addSubcommand(s => s.setName("setup")),

  new SlashCommandBuilder().setName("antinuke")
    .setDescription("Setup anti nuke")
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

  console.log("✅ FULL PRO BOT READY");
});

// ───────── LOG SYSTEM ─────────

async function log(guild, data) {
  const conf = getGuild(guild.id);
  if (!conf.logChannel) return;

  const ch = guild.channels.cache.get(conf.logChannel);
  if (!ch) return;

  ch.send({ embeds: [data] }).catch(() => {});
}

// ───────── SECURITY TRACKERS ─────────

const joins = {};
const spam = {};

// ───────── ANTIRAID ─────────

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
  if (!g.antiraid) return;

  if (g.whitelist.includes(msg.author.id)) return;

  spam[msg.author.id] ??= [];
  spam[msg.author.id].push(Date.now());

  spam[msg.author.id] =
    spam[msg.author.id].filter(t => Date.now() - t < 4000);

  if (spam[msg.author.id].length >= 6)
    await msg.member?.timeout(300000).catch(() => {});

  if (g.linkBlock && /(https?:\/\/)/.test(msg.content)) {
    await msg.delete().catch(() => {});
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

  const g = i.guild;
  const member = await g.members.fetch(i.user.id).catch(() => null);
  if (!member) return;

  served++;

  const reply = d =>
    i.replied ? i.followUp(d) : i.reply(d);

  // ───────── HELP ─────────
  if (i.commandName === "help")
    return reply({ embeds: [embed("Commands", 0x3498db)] });

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

  // ───────── ANTIRAID UI ─────────
  if (i.commandName === "antiraid")
    return reply({
      content: "Anti-Raid Setup",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("raid_on").setLabel("Enable").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("raid_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
        )
      ],
      ephemeral: true
    });

  // ───────── ANTINUKE UI ─────────
  if (i.commandName === "antinuke")
    return reply({
      content: "Anti-Nuke Setup",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("nuke_on").setLabel("Enable").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("nuke_off").setLabel("Disable").setStyle(ButtonStyle.Danger)
        )
      ],
      ephemeral: true
    });

  // ───────── PERMS ─────────
  if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
    return reply({ content: "❌ No permission", ephemeral: true });

  const targetUser = i.options.getUser("user");
  const target = targetUser
    ? await g.members.fetch(targetUser.id).catch(() => null)
    : null;

  // ───────── MODERATION ─────────

  if (i.commandName === "kick") {
    if (!target || !target.kickable)
      return reply({ content: "❌ Can't kick", ephemeral: true });

    await target.kick();
    return reply({ embeds: [embed("Kicked", 0xe67e22)] });
  }

  if (i.commandName === "ban") {
    await g.members.ban(targetUser.id).catch(() => {});
    return reply({ embeds: [embed("Banned", 0xe74c3c)] });
  }

  if (i.commandName === "timeout") {
    const mins = i.options.getInteger("minutes");

    if (!target || mins > 40320)
      return reply({ content: "❌ Invalid", ephemeral: true });

    await target.timeout(mins * 60000);
    return reply({ embeds: [embed("Timed Out", 0xf1c40f)] });
  }

  if (i.commandName === "warn") {
    const reason = i.options.getString("reason");

    warns[targetUser.id] ??= [];
    warns[targetUser.id].push(reason);
    saveWarns();

    return reply({ embeds: [embed("Warned", 0xf1c40f)] });
  }

  if (i.commandName === "warnings") {
    return reply({
      embeds: [embed("Warnings", 0x3498db, [
        { name: targetUser.tag, value: warns[targetUser.id]?.join("\n") || "None" }
      ])]
    });
  }

  if (i.commandName === "purge") {
    const amount = i.options.getInteger("amount");

    if (amount < 1 || amount > 100)
      return reply({ content: "❌ 1-100", ephemeral: true });

    await i.channel.bulkDelete(amount, true).catch(() => {});
    return reply({ embeds: [embed("Purged", 0xe67e22)], ephemeral: true });
  }

  if (i.commandName === "addrole") {
    const role = i.options.getRole("role");

    if (!target || !role.editable)
      return reply({ content: "❌ Can't add role", ephemeral: true });

    await target.roles.add(role).catch(() => {});
    return reply({ embeds: [embed("Role added", 0x2ecc71)] });
  }

  if (i.commandName === "setnick") {
    const nick = i.options.getString("nickname");

    if (!target || !target.manageable)
      return reply({ content: "❌ Can't edit", ephemeral: true });

    await target.setNickname(nick).catch(() => {});
    return reply({ embeds: [embed("Nick updated", 0x3498db)] });
  }

  if (i.commandName === "antiraid") {
    getGuild(g.id).antiraid = true;
    saveConfig();
    return reply({ embeds: [embed("Anti-Raid enabled", 0x2ecc71)] });
  }

  if (i.commandName === "antinuke") {
    getGuild(g.id).antinuke = true;
    saveConfig();
    return reply({ embeds: [embed("Anti-Nuke enabled", 0xe74c3c)] });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
