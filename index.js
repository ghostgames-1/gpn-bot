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

function saveWarns() {
  fs.writeFileSync(WARN_DB, JSON.stringify(warns, null, 2));
}
function saveConfig() {
  fs.writeFileSync(CONFIG_DB, JSON.stringify(config, null, 2));
}
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

const embed = (t, c, f=[]) =>
  new EmbedBuilder().setTitle(t).setColor(c).addFields(f).setTimestamp();

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("🏓 Ping"),

  new SlashCommandBuilder().setName("help").setDescription("📋 Commands"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Kick user")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addStringOption(o=>o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Ban user")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addStringOption(o=>o.setName("reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("⏳ Timeout user")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("✏️ Set nickname")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addStringOption(o=>o.setName("nickname").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("➕ Add role")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addRoleOption(o=>o.setName("role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Warn")
    .addUserOption(o=>o.setName("user").setRequired(true))
    .addStringOption(o=>o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("📊 View warnings")
    .addUserOption(o=>o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("🧹 Delete messages")
    .addIntegerOption(o=>o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("🛡 Anti-raid setup")
    .addSubcommand(s=>s.setName("setup")),

  new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("💣 Anti-nuke setup")
    .addSubcommand(s=>s.setName("setup"))

].map(c=>c.toJSON());

// ───────── READY ─────────

client.once("ready", async () => {
  const rest = new REST({version:"10"}).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  client.user.setPresence({
    activities:[{name:"Protecting servers", type:ActivityType.Watching}]
  });

  console.log("✅ Ready");
});

// ───────── TRACKERS ─────────

const joins = {};
const spam = {};

// ───────── ANTIRAID ─────────

client.on("guildMemberAdd", async member => {
  const conf = getGuild(member.guild.id);
  if (!conf.antiraid) return;

  joins[member.guild.id] ??= [];
  joins[member.guild.id].push(Date.now());

  joins[member.guild.id] =
    joins[member.guild.id].filter(t=>Date.now()-t<10000);

  if (joins[member.guild.id].length >= 5)
    await member.timeout(600000).catch(()=>{});
});

// spam + links
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const conf = getGuild(msg.guild.id);
  if (!conf.antiraid) return;

  if (conf.whitelist.includes(msg.author.id)) return;

  spam[msg.author.id] ??= [];
  spam[msg.author.id].push(Date.now());

  spam[msg.author.id] =
    spam[msg.author.id].filter(t=>Date.now()-t<4000);

  if (spam[msg.author.id].length >= 6)
    await msg.member.timeout(300000).catch(()=>{});

  if (conf.linkBlock && /(https?:\/\/)/.test(msg.content)) {
    await msg.delete().catch(()=>{});
    await msg.member.timeout(300000).catch(()=>{});
  }
});

// ───────── ANTINUKE ─────────

async function punish(guild, executorId) {
  const conf = getGuild(guild.id);
  if (!conf.antinuke) return;

  if (conf.whitelist.includes(executorId)) return;

  const member = await guild.members.fetch(executorId).catch(()=>null);
  if (!member) return;

  await member.timeout(600000).catch(()=>{});
}

client.on("channelDelete", async ch => {
  const logs = await ch.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelDelete,
    limit: 1
  }).catch(()=>null);

  const entry = logs?.entries.first();
  if (entry) punish(ch.guild, entry.executor.id);
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({
    type: AuditLogEvent.RoleDelete,
    limit: 1
  }).catch(()=>null);

  const entry = logs?.entries.first();
  if (entry) punish(role.guild, entry.executor.id);
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const guild = i.guild;
  const member = await guild.members.fetch(i.user.id);

  try {

    if (i.commandName === "ping")
      return i.reply({ embeds:[embed("🏓 Pong",0x2ecc71)] });

    if (i.commandName === "help")
      return i.reply({
        embeds:[embed("📋 Commands",0x3498db,[
          {name:"Moderation",value:"/kick /ban /timeout /warn /warnings /purge /addrole /setnick"},
          {name:"Security",value:"/antiraid setup /antinuke setup"}
        ])]
      });

    // ───────── PERMISSION CHECK ─────────
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return i.reply({ content:"❌ Missing permissions", ephemeral:true });

    // ───────── MOD COMMANDS ─────────

    if (i.commandName === "kick") {
      const u = i.options.getUser("user");
      const m = await guild.members.fetch(u.id);
      if (!m.kickable) return i.reply({content:"❌ Can't kick",ephemeral:true});
      await m.kick();
      return i.reply({ embeds:[embed("👢 User Kicked",0xe67e22)] });
    }

    if (i.commandName === "ban") {
      const u = i.options.getUser("user");
      await guild.members.ban(u.id);
      return i.reply({ embeds:[embed("🔨 User Banned",0xe74c3c)] });
    }

    if (i.commandName === "timeout") {
      const u = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");
      if (mins > 40320) return i.reply({content:"❌ Max 28 days",ephemeral:true});
      const m = await guild.members.fetch(u.id);
      await m.timeout(mins*60000);
      return i.reply({ embeds:[embed("⏳ Timed Out",0xf1c40f)] });
    }

    if (i.commandName === "setnick") {
      const u = i.options.getUser("user");
      const nick = i.options.getString("nickname");
      const m = await guild.members.fetch(u.id);
      if (!m.manageable) return i.reply({content:"❌ Can't edit",ephemeral:true});
      await m.setNickname(nick);
      return i.reply({ embeds:[embed("✏️ Nick Updated",0x3498db)] });
    }

    if (i.commandName === "addrole") {
      const u = i.options.getUser("user");
      const role = i.options.getRole("role");
      const m = await guild.members.fetch(u.id);
      if (!role.editable) return i.reply({content:"❌ Role too high",ephemeral:true});
      await m.roles.add(role);
      return i.reply({ embeds:[embed("➕ Role Added",0x2ecc71)] });
    }

    if (i.commandName === "warn") {
      const u = i.options.getUser("user");
      const reason = i.options.getString("reason");
      warns[u.id] ??= [];
      warns[u.id].push(reason);
      if (warns[u.id].length > 50) warns[u.id].shift();
      saveWarns();
      return i.reply({ embeds:[embed("⚠️ Warned",0xf1c40f)] });
    }

    if (i.commandName === "warnings") {
      const u = i.options.getUser("user");
      return i.reply({
        embeds:[embed("📊 Warnings",0x3498db,[
          {name:u.tag,value:warns[u.id]?.join("\n") || "None"}
        ])]
      });
    }

    if (i.commandName === "purge") {
      const amount = i.options.getInteger("amount");
      if (amount < 1 || amount > 100)
        return i.reply({content:"❌ 1-100",ephemeral:true});
      await i.channel.bulkDelete(amount, true);
      return i.reply({ embeds:[embed("🧹 Purged",0xe67e22)], ephemeral:true });
    }

    // ───────── SETUP ─────────

    if (i.commandName === "antiraid") {
      const conf = getGuild(guild.id);
      conf.antiraid = true;
      saveConfig();
      return i.reply({ embeds:[embed("🛡 Anti-Raid Enabled",0x2ecc71)] });
    }

    if (i.commandName === "antinuke") {
      const conf = getGuild(guild.id);
      conf.antinuke = true;
      saveConfig();
      return i.reply({ embeds:[embed("💣 Anti-Nuke Enabled",0xe74c3c)] });
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content:"❌ Error", ephemeral:true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
