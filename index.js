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
  AuditLogEvent
} = require("discord.js");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── CLIENT ─────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ───────── DATABASE ─────────

const WARN_DB = "./warns.json";
const CONFIG_DB = "./config.json";

let warns = fs.existsSync(WARN_DB) ? JSON.parse(fs.readFileSync(WARN_DB)) : {};
let config = fs.existsSync(CONFIG_DB) ? JSON.parse(fs.readFileSync(CONFIG_DB)) : {};

const saveWarns = () => fs.writeFileSync(WARN_DB, JSON.stringify(warns, null, 2));
const saveConfig = () => fs.writeFileSync(CONFIG_DB, JSON.stringify(config, null, 2));

function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      antinuke: false,
      whitelist: [],
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

// ───────── COMMANDS ─────────

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Ping"),

  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("nickname").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add role")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addRoleOption(o => o.setName("role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Setup anti raid")
    .addSubcommand(s => s.setName("setup")),

  new SlashCommandBuilder()
    .setName("antinuke")
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

  client.user.setPresence({
    activities: [{ name: "Protecting servers", type: ActivityType.Watching }]
  });

  console.log("✅ Bot ready");
});

// ───────── TRACKERS ─────────

const joins = {};
const spam = {};

// ───────── ANTIRAID ─────────

client.on("guildMemberAdd", async member => {
  try {
    const conf = getGuild(member.guild.id);
    if (!conf.antiraid) return;

    joins[member.guild.id] ??= [];
    joins[member.guild.id].push(Date.now());

    joins[member.guild.id] =
      joins[member.guild.id].filter(t => Date.now() - t < 10000);

    if (joins[member.guild.id].length >= 5) {
      await member.timeout(600000).catch(() => {});
    }
  } catch {}
});

client.on("messageCreate", async msg => {
  try {
    if (!msg.guild || msg.author.bot) return;

    const conf = getGuild(msg.guild.id);
    if (!conf.antiraid) return;

    if (conf.whitelist.includes(msg.author.id)) return;

    spam[msg.author.id] ??= [];
    spam[msg.author.id].push(Date.now());

    spam[msg.author.id] =
      spam[msg.author.id].filter(t => Date.now() - t < 4000);

    if (spam[msg.author.id].length >= 6) {
      await msg.member?.timeout(300000).catch(() => {});
    }

    if (conf.linkBlock && /(https?:\/\/)/.test(msg.content)) {
      await msg.delete().catch(() => {});
      await msg.member?.timeout(300000).catch(() => {});
    }
  } catch {}
});

// ───────── ANTINUKE ─────────

async function punish(guild, id) {
  try {
    const conf = getGuild(guild.id);
    if (!conf.antinuke) return;
    if (conf.whitelist.includes(id)) return;

    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) return;

    await member.timeout(600000).catch(() => {});
  } catch {}
}

client.on("channelDelete", async ch => {
  try {
    const logs = await ch.guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelDelete,
      limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    if (entry) punish(ch.guild, entry.executor.id);
  } catch {}
});

client.on("roleDelete", async role => {
  try {
    const logs = await role.guild.fetchAuditLogs({
      type: AuditLogEvent.RoleDelete,
      limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    if (entry) punish(role.guild, entry.executor.id);
  } catch {}
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand() || !i.guild) return;

  try {
    const guild = i.guild;
    const member = await guild.members.fetch(i.user.id).catch(() => null);

    if (!member)
      return i.reply({ content: "❌ Member error", ephemeral: true });

    const reply = (data) =>
      i.replied || i.deferred ? i.followUp(data) : i.reply(data);

    if (i.commandName === "ping")
      return reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

    if (i.commandName === "help")
      return reply({
        embeds: [embed("Commands", 0x3498db)]
      });

    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return reply({ content: "❌ No permission", ephemeral: true });

    // SAFE FETCH TARGET
    const getTarget = async () => {
      const u = i.options.getUser("user");
      if (!u) return null;
      return await guild.members.fetch(u.id).catch(() => null);
    };

    // KICK
    if (i.commandName === "kick") {
      const m = await getTarget();
      if (!m || !m.kickable)
        return reply({ content: "❌ Can't kick", ephemeral: true });

      await m.kick();
      return reply({ embeds: [embed("👢 Kicked", 0xe67e22)] });
    }

    // BAN
    if (i.commandName === "ban") {
      const u = i.options.getUser("user");
      if (!u)
        return reply({ content: "❌ Invalid user", ephemeral: true });

      await guild.members.ban(u.id).catch(() => {});
      return reply({ embeds: [embed("🔨 Banned", 0xe74c3c)] });
    }

    // TIMEOUT
    if (i.commandName === "timeout") {
      const m = await getTarget();
      const mins = i.options.getInteger("minutes");

      if (!m || mins < 1 || mins > 40320)
        return reply({ content: "❌ Invalid", ephemeral: true });

      await m.timeout(mins * 60000).catch(() => {});
      return reply({ embeds: [embed("⏳ Timed Out", 0xf1c40f)] });
    }

    // SETNICK
    if (i.commandName === "setnick") {
      const m = await getTarget();
      const nick = i.options.getString("nickname");

      if (!m || !m.manageable)
        return reply({ content: "❌ Can't change nick", ephemeral: true });

      await m.setNickname(nick).catch(() => {});
      return reply({ embeds: [embed("✏️ Nick Updated", 0x3498db)] });
    }

    // ADDROLE
    if (i.commandName === "addrole") {
      const m = await getTarget();
      const role = i.options.getRole("role");

      if (!m || !role || !role.editable)
        return reply({ content: "❌ Can't add role", ephemeral: true });

      await m.roles.add(role).catch(() => {});
      return reply({ embeds: [embed("➕ Role Added", 0x2ecc71)] });
    }

    // WARN
    if (i.commandName === "warn") {
      const u = i.options.getUser("user");
      const reason = i.options.getString("reason");

      if (!u || !reason)
        return reply({ content: "❌ Invalid", ephemeral: true });

      warns[u.id] ??= [];
      warns[u.id].push(reason);
      saveWarns();

      return reply({ embeds: [embed("⚠️ Warned", 0xf1c40f)] });
    }

    // WARNINGS
    if (i.commandName === "warnings") {
      const u = i.options.getUser("user");
      if (!u)
        return reply({ content: "❌ Invalid", ephemeral: true });

      return reply({
        embeds: [embed("Warnings", 0x3498db, [
          { name: u.tag, value: warns[u.id]?.join("\n") || "None" }
        ])]
      });
    }

    // PURGE
    if (i.commandName === "purge") {
      const amount = i.options.getInteger("amount");

      if (amount < 1 || amount > 100)
        return reply({ content: "❌ 1-100", ephemeral: true });

      await i.channel.bulkDelete(amount, true).catch(() => {});
      return reply({ embeds: [embed("🧹 Purged", 0xe67e22)], ephemeral: true });
    }

    // SETUPS
    if (i.commandName === "antiraid") {
      getGuild(guild.id).antiraid = true;
      saveConfig();
      return reply({ embeds: [embed("🛡 Anti-Raid Enabled", 0x2ecc71)] });
    }

    if (i.commandName === "antinuke") {
      getGuild(guild.id).antinuke = true;
      saveConfig();
      return reply({ embeds: [embed("💣 Anti-Nuke Enabled", 0xe74c3c)] });
    }

  } catch (err) {
    console.error(err);
    if (!i.replied) i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
