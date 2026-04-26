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

// ───────── SAFE DB ─────────
function load(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const d = fs.readFileSync(file, "utf8");
    return d ? JSON.parse(d) : {};
  } catch {
    return {};
  }
}

const WARN_FILE = "./warns.json";
const CONFIG_FILE = "./config.json";

let warns = load(WARN_FILE);
let config = load(CONFIG_FILE);

const saveWarns = () =>
  fs.writeFileSync(WARN_FILE, JSON.stringify(warns, null, 2));

const saveConfig = () =>
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

// ───────── DEFAULT GUILD CONFIG ─────────
function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      antiraid: false,
      raid: {
        enabled: false,
        antiSpam: true,
        antiLinks: true,
        maxJoins: 5,
        joinWindow: 10000,
        autoLockdown: true
      }
    };
  }
  return config[id];
}

// ───────── EMBED ─────────
const embed = (t, c, f = []) =>
  new EmbedBuilder().setTitle(t).setColor(c).addFields(f).setTimestamp();

// ───────── HELPERS ─────────
const getUser = (i, n) => i.options.getUser(n);
const getRole = (i, n) => i.options.getRole(n);

// ───────── RAID TRACKERS ─────────
const joins = new Map();
const msgs = new Map();

// ───────── COMMANDS ─────────
const commands = [

  new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send message (OWNER ONLY)")
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask 8ball")
    .addStringOption(o =>
      o.setName("question").setDescription("Question").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban user")
    .addStringOption(o =>
      o.setName("userid").setDescription("User ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unkick")
    .setDescription("Kick cannot be undone (info)"),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Remove last warning")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("nickname").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add role")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Anti-raid system")
    .addSubcommand(s =>
      s.setName("setup").setDescription("Configure raid system")
    )

].map(c => c.toJSON());

// ───────── READY ─────────
client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  client.user.setPresence({
    activities: [{
      name: `${client.guilds.cache.size} servers`,
      type: ActivityType.Watching
    }],
    status: "online"
  });

  console.log(`Logged in as ${client.user.tag}`);
});

// ───────── RAID PANEL ─────────
function raidPanel(g) {
  return {
    embeds: [
      embed("🛡 Anti-Raid Panel", 0x2ecc71, [
        { name: "Enabled", value: String(g.raid.enabled) },
        { name: "Anti Spam", value: String(g.raid.antiSpam) },
        { name: "Anti Links", value: String(g.raid.antiLinks) }
      ])
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Enable", custom_id: "raid_on" },
          { type: 2, style: 4, label: "Disable", custom_id: "raid_off" }
        ]
      },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: "Spam Toggle", custom_id: "raid_spam" },
          { type: 2, style: 2, label: "Links Toggle", custom_id: "raid_links" }
        ]
      }
    ]
  };
}

// ───────── INTERACTIONS ─────────
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const g = getGuild(i.guild.id);

  try {

    // ───── PING ─────
    if (i.commandName === "ping")
      return i.reply({ embeds: [embed("🏓 Pong", 0x2ecc71)] });

    // ───── SAY OWNER ONLY ─────
    if (i.commandName === "say") {
      if (i.user.id !== i.guild.ownerId)
        return i.reply({ content: "Owner only", ephemeral: true });

      await i.channel.send(i.options.getString("message"));
      return i.reply({ content: "Sent", ephemeral: true });
    }

    // ───── 8BALL ─────
    if (i.commandName === "8ball") {
      const ans = ["Yes", "No", "Maybe", "Ask again"];
      return i.reply({
        embeds: [embed("🎱 8Ball", 0x9b59b6, [
          { name: "Q", value: i.options.getString("question") },
          { name: "A", value: ans[Math.floor(Math.random() * ans.length)] }
        ])]
      });
    }

    // ───── SETNICK ─────
    if (i.commandName === "setnick") {
      const u = getUser(i, "user");
      const m = await i.guild.members.fetch(u.id).catch(() => null);

      if (!m?.manageable)
        return i.reply({ content: "Cannot change nick", ephemeral: true });

      await m.setNickname(i.options.getString("nickname"));
      return i.reply({ embeds: [embed("Nickname Updated")] });
    }

    // ───── ADDROLE ─────
    if (i.commandName === "addrole") {
      const u = getUser(i, "user");
      const r = getRole(i, "role");

      const m = await i.guild.members.fetch(u.id).catch(() => null);
      if (!m || !r?.editable)
        return i.reply({ content: "Cannot add role", ephemeral: true });

      await m.roles.add(r);
      return i.reply({ embeds: [embed("Role Added")] });
    }

    // ───── ANTIRAID SETUP ─────
    if (i.commandName === "antiraid") {
      if (i.options.getSubcommand() === "setup") {
        g.raid.enabled = true;
        saveConfig();
        return i.reply(raidPanel(g));
      }
    }

    // ───── WARN SYSTEM ─────
    if (i.commandName === "warn") {
      const u = getUser(i, "user");
      const r = i.options.getString("reason");

      warns[u.id] ??= [];
      warns[u.id].push(r);
      saveWarns();

      return i.reply({ embeds: [embed("Warned")] });
    }

    if (i.commandName === "unwarn") {
      const u = getUser(i, "user");
      warns[u.id]?.pop();
      saveWarns();
      return i.reply({ embeds: [embed("Warning Removed")] });
    }

    if (i.commandName === "warnings") {
      const u = getUser(i, "user");
      return i.reply({
        embeds: [embed("Warnings", 0x3498db, [
          { name: u.tag, value: warns[u.id]?.join("\n") || "None" }
        ])]
      });
    }

    // ───── UNBAN ─────
    if (i.commandName === "unban") {
      await i.guild.bans.remove(i.options.getString("userid")).catch(() => {});
      return i.reply({ embeds: [embed("Unbanned")] });
    }

    // ───── UNKICK ─────
    if (i.commandName === "unkick") {
      return i.reply({ embeds: [embed("Reinvite user manually")] });
    }

  } catch (err) {
    console.error(err);
    if (!i.replied) i.reply({ content: "Error", ephemeral: true });
  }
});

// ───────── LOGIN ─────────
client.login(process.env.TOKEN);
