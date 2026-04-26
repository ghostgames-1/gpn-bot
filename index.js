const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActivityType
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

// ───────── SAFETY ─────────

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ───────── DATABASE ─────────

const CONFIG_FILE = "./config.json";
const WARN_FILE = "./warns.json";

let config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
let warns = fs.existsSync(WARN_FILE) ? JSON.parse(fs.readFileSync(WARN_FILE)) : {};

let served = 0;

const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
const saveWarns = () => fs.writeFileSync(WARN_FILE, JSON.stringify(warns, null, 2));

function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      whitelist: [],
      linkBlock: true,
      logChannel: null
    };
  }
  return config[id];
}

// ───────── SAFE HELPERS ─────────

function embed(title, color, fields = []) {
  const e = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  if (fields.length) e.addFields(fields);
  return e;
}

function getUser(i, name) {
  return i.options.getUser(name) || null;
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

// ───────── SECURITY ─────────

const joins = {};
const spam = {};

client.on("guildMemberAdd", async m => {
  const g = getGuild(m.guild.id);
  if (!g.antiraid) return;

  joins[m.guild.id] ??= [];
  joins[m.guild.id].push(Date.now());

  joins[m.guild.id] = joins[m.guild.id].filter(t => Date.now() - t < 10000);

  if (joins[m.guild.id].length >= 5)
    await m.timeout(600000).catch(() => {});
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

  spam[msg.author.id] = spam[msg.author.id].filter(t => Date.now() - t < 4000);

  if (spam[msg.author.id].length >= 6)
    await msg.member?.timeout(300000).catch(() => {});
});

// ───────── COMMANDS ─────────

const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Check latency"),

  new SlashCommandBuilder().setName("help").setDescription("Commands"),

  new SlashCommandBuilder().setName("say")
    .setDescription("Send message as bot")
    .addStringOption(o => o.setName("message").setRequired(true)),

  new SlashCommandBuilder().setName("8ball")
    .setDescription("Ask 8ball")
    .addStringOption(o => o.setName("question").setRequired(true)),

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
    .setDescription("Set logs")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder().setName("whitelist")
    .setDescription("Whitelist")
    .addSubcommand(s => s.setName("add").addUserOption(o => o.setName("user").setRequired(true)))
    .addSubcommand(s => s.setName("remove").addUserOption(o => o.setName("user").setRequired(true))),

  new SlashCommandBuilder().setName("antiraid")
    .setDescription("Enable anti raid")

].map(c => c.toJSON());

// ───────── READY ─────────

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  updateStatus();
  setInterval(updateStatus, 15000);

  console.log("✅ Bot ready");
});

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const start = Date.now();

  try {
    if (!i.guild) return safeReply(i, { content: "❌ Guild only", ephemeral: true });

    served++;

    const guild = i.guild;
    const member = await guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return;

    const g = getGuild(guild.id);

    const requirePerm = (p) => {
      if (!member.permissions.has(p))
        throw new Error("No permission");
    };

    // ───── PING ─────
    if (i.commandName === "ping") {
      const api = Math.round(client.ws.ping);
      const latency = Date.now() - start;

      return safeReply(i, {
        embeds: [embed("🏓 Pong", 0x2ecc71, [
          { name: "API Latency", value: `${api} ms`, inline: true },
          { name: "Response Time", value: `${latency} ms`, inline: true }
        ])]
      });
    }

    // ───── SAY ─────
    if (i.commandName === "say") {
      const msg = i.options.getString("message");

      await i.channel.send(msg).catch(() => {});
      return safeReply(i, {
        embeds: [embed("✅ Sent", 0x2ecc71)],
        ephemeral: true
      });
    }

    // ───── 8BALL ─────
    if (i.commandName === "8ball") {
      const q = i.options.getString("question");

      const answers = ["Yes", "No", "Maybe", "Definitely", "Ask again later"];
      const a = answers[Math.floor(Math.random() * answers.length)];

      return safeReply(i, {
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Question", value: q },
          { name: "Answer", value: a }
        ])]
      });
    }

    // ───── ANTIRAID ─────
    if (i.commandName === "antiraid") {
      g.antiraid = true;
      saveConfig();
      return safeReply(i, { embeds: [embed("🛡 Enabled", 0x2ecc71)] });
    }

    // ───── MODERATION ─────

    if (i.commandName === "kick") {
      requirePerm(PermissionsBitField.Flags.KickMembers);
      const u = getUser(i, "user");
      const t = await resolveMember(guild, u);

      if (!t || !t.kickable)
        return safeReply(i, { content: "❌ Can't kick", ephemeral: true });

      await t.kick();
      return safeReply(i, { embeds: [embed("Kicked", 0xe67e22)] });
    }

    if (i.commandName === "ban") {
      requirePerm(PermissionsBitField.Flags.BanMembers);
      const u = getUser(i, "user");

      await guild.members.ban(u.id).catch(() => {});
      return safeReply(i, { embeds: [embed("Banned", 0xe74c3c)] });
    }

    if (i.commandName === "timeout") {
      requirePerm(PermissionsBitField.Flags.ModerateMembers);

      const u = getUser(i, "user");
      const mins = i.options.getInteger("minutes");
      const t = await resolveMember(guild, u);

      if (!t) return;

      await t.timeout(mins * 60000).catch(() => {});
      return safeReply(i, { embeds: [embed("Timed out", 0xf1c40f)] });
    }

    if (i.commandName === "warn") {
      const u = getUser(i, "user");
      const r = i.options.getString("reason");

      warns[u.id] ??= [];
      warns[u.id].push(r);
      saveWarns();

      return safeReply(i, { embeds: [embed("Warned", 0xf1c40f)] });
    }

    if (i.commandName === "warnings") {
      const u = getUser(i, "user");

      return safeReply(i, {
        embeds: [embed("Warnings", 0x3498db, [
          { name: u.tag, value: warns[u.id]?.join("\n") || "None" }
        ])]
      });
    }

    if (i.commandName === "purge") {
      const a = i.options.getInteger("amount");

      if (a < 1 || a > 100)
        return safeReply(i, { content: "❌ 1-100", ephemeral: true });

      await i.channel.bulkDelete(a, true).catch(() => {});
      return safeReply(i, {
        embeds: [embed("Purged", 0xe67e22)],
        ephemeral: true
      });
    }

    if (i.commandName === "addrole") {
      const u = getUser(i, "user");
      const r = getRole(i, "role");
      const t = await resolveMember(guild, u);

      if (!t || !r.editable)
        return safeReply(i, { content: "❌ Cannot add role", ephemeral: true });

      await t.roles.add(r);
      return safeReply(i, { embeds: [embed("Role added", 0x2ecc71)] });
    }

    if (i.commandName === "setnick") {
      const u = getUser(i, "user");
      const n = i.options.getString("nickname");
      const t = await resolveMember(guild, u);

      if (!t || !t.manageable)
        return safeReply(i, { content: "❌ Cannot change nick", ephemeral: true });

      await t.setNickname(n);
      return safeReply(i, { embeds: [embed("Nick updated", 0x3498db)] });
    }

    if (i.commandName === "setlog") {
      const ch = i.options.getChannel("channel");
      g.logChannel = ch.id;
      saveConfig();

      return safeReply(i, { embeds: [embed("Logs set", 0x2ecc71)] });
    }

    if (i.commandName === "whitelist") {
      const sub = i.options.getSubcommand();
      const u = getUser(i, "user");

      if (sub === "add") g.whitelist.push(u.id);
      if (sub === "remove") g.whitelist = g.whitelist.filter(x => x !== u.id);

      saveConfig();
      return safeReply(i, { embeds: [embed("Whitelist updated", 0x3498db)] });
    }

  } catch (err) {
    console.error(err);
    return safeReply(i, { content: "❌ Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────

client.login(process.env.TOKEN);
