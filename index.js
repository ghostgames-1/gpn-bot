// ================================
// GPN BOT — ENTERPRISE SINGLE FILE
// Stable / Validation-Fixed Version
// Discord.js v14
// ================================

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
  ButtonStyle
} = require("discord.js");

// ================================
// SAFETY
// ================================

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ================================
// TOKEN CHECK
// ================================

if (!process.env.TOKEN) {
  console.error("❌ Missing TOKEN environment variable.");
  process.exit(1);
}

// ================================
// CLIENT
// ================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================================
// DATABASE
// ================================

function loadJSON(path) {
  try {
    if (!fs.existsSync(path)) return {};
    const data = fs.readFileSync(path, "utf8");
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

const WARNS_FILE = "./warns.json";
const CONFIG_FILE = "./config.json";

let warns = loadJSON(WARNS_FILE);
let config = loadJSON(CONFIG_FILE);

// ================================
// DEFAULT GUILD CONFIG
// ================================

function getGuild(id) {
  if (!config[id]) {
    config[id] = {
      raid: {
        enabled: false,
        antiSpam: true,
        antiLinks: true,
        autoLockdown: true,
        maxJoins: 5,
        joinWindow: 10000
      }
    };
  }

  return config[id];
}

// ================================
// EMBED
// ================================

function embed(title, color, fields = []) {
  const e = new EmbedBuilder()
    .setTitle(String(title || "Info"))
    .setColor(color || 0x2ecc71)
    .setTimestamp();

  if (Array.isArray(fields) && fields.length > 0) {
    e.addFields(fields);
  }

  return e;
}

// ================================
// HELPERS
// ================================

async function fetchMember(guild, user) {
  try {
    return await guild.members.fetch(user.id);
  } catch {
    return null;
  }
}

// ================================
// RAID TRACKING
// ================================

const joinTracker = new Map();
const msgTracker = new Map();

// ================================
// LOCKDOWN
// ================================

async function lockdown(guild) {
  for (const channel of guild.channels.cache.values()) {
    try {
      if (!channel.permissionOverwrites) continue;

      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false
        }
      );
    } catch {}
  }
}

// ================================
// ANTIRAID — JOIN DETECTION
// ================================

client.on("guildMemberAdd", async member => {
  const g = getGuild(member.guild.id);

  if (!g.raid.enabled) return;

  if (!joinTracker.has(member.guild.id)) {
    joinTracker.set(member.guild.id, []);
  }

  const arr = joinTracker.get(member.guild.id);

  arr.push(Date.now());

  const recent = arr.filter(
    t => Date.now() - t < g.raid.joinWindow
  );

  joinTracker.set(member.guild.id, recent);

  if (
    recent.length >= g.raid.maxJoins &&
    g.raid.autoLockdown
  ) {
    await lockdown(member.guild);
  }
});

// ================================
// ANTISPAM
// ================================

client.on("messageCreate", async msg => {
  if (!msg.guild) return;
  if (msg.author.bot) return;

  const g = getGuild(msg.guild.id);

  if (!g.raid.enabled) return;

  if (!msgTracker.has(msg.author.id)) {
    msgTracker.set(msg.author.id, []);
  }

  const arr = msgTracker.get(msg.author.id);

  arr.push(Date.now());

  const recent = arr.filter(
    t => Date.now() - t < 4000
  );

  msgTracker.set(msg.author.id, recent);

  // spam
  if (g.raid.antiSpam && recent.length >= 6) {
    await msg.member.timeout(
      5 * 60 * 1000,
      "Anti-spam"
    ).catch(() => {});
  }

  // links
  if (
    g.raid.antiLinks &&
    /(https?:\/\/)/i.test(msg.content)
  ) {
    await msg.delete().catch(() => {});
  }
});

// ================================
// COMMANDS
// ================================

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Show bot latency"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Owner only say command")
    .addStringOption(o =>
      o
        .setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8ball")
    .addStringOption(o =>
      o
        .setName("question")
        .setDescription("Question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption(o =>
      o
        .setName("userid")
        .setDescription("User ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("minutes")
        .setDescription("Minutes")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Remove last warning")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("1-100")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("nickname")
        .setDescription("Nickname")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add role to user")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o
        .setName("role")
        .setDescription("Role")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configure anti raid")
    .addSubcommand(s =>
      s
        .setName("setup")
        .setDescription("Open setup panel")
    )

].map(c => c.toJSON());

// ================================
// READY
// ================================

client.once("ready", async () => {

  try {

    const rest = new REST({
      version: "10"
    }).setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    client.user.setPresence({
      activities: [
        {
          name: `${client.guilds.cache.size} servers`,
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });

    console.log(`✅ Logged in as ${client.user.tag}`);

  } catch (err) {
    console.error(err);
  }
});

// ================================
// RAID PANEL
// ================================

function raidPanel(g) {

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("raid_enable")
      .setLabel("Enable")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("raid_disable")
      .setLabel("Disable")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("raid_spam")
      .setLabel("Toggle Spam")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("raid_links")
      .setLabel("Toggle Links")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [
      embed(
        "🛡 Anti Raid Setup",
        0x2ecc71,
        [
          {
            name: "Enabled",
            value: String(g.raid.enabled),
            inline: true
          },
          {
            name: "Anti Spam",
            value: String(g.raid.antiSpam),
            inline: true
          },
          {
            name: "Anti Links",
            value: String(g.raid.antiLinks),
            inline: true
          }
        ]
      )
    ],
    components: [row1, row2]
  };
}

// ================================
// INTERACTIONS
// ================================

client.on("interactionCreate", async i => {

  try {

    // ============================
    // BUTTONS
    // ============================

    if (i.isButton()) {

      const g = getGuild(i.guild.id);

      if (i.customId === "raid_enable") {
        g.raid.enabled = true;
      }

      if (i.customId === "raid_disable") {
        g.raid.enabled = false;
      }

      if (i.customId === "raid_spam") {
        g.raid.antiSpam = !g.raid.antiSpam;
      }

      if (i.customId === "raid_links") {
        g.raid.antiLinks = !g.raid.antiLinks;
      }

      saveJSON(CONFIG_FILE, config);

      return i.update(raidPanel(g));
    }

    // ============================
    // CHAT COMMANDS
    // ============================

    if (!i.isChatInputCommand()) return;

    // ping
    if (i.commandName === "ping") {
      return i.reply({
        embeds: [
          embed("🏓 Pong", 0x2ecc71, [
            {
              name: "Latency",
              value: `${client.ws.ping}ms`
            }
          ])
        ]
      });
    }

    // say
    if (i.commandName === "say") {

      if (i.user.id !== i.guild.ownerId) {
        return i.reply({
          content: "❌ Owner only",
          ephemeral: true
        });
      }

      const msg = i.options.getString("message");

      await i.channel.send({
        content: msg
      });

      return i.reply({
        content: "✅ Sent",
        ephemeral: true
      });
    }

    // 8ball
    if (i.commandName === "8ball") {

      const answers = [
        "Yes",
        "No",
        "Maybe",
        "Definitely",
        "Ask later"
      ];

      return i.reply({
        embeds: [
          embed("🎱 8Ball", 0x9b59b6, [
            {
              name: "Question",
              value: i.options.getString("question")
            },
            {
              name: "Answer",
              value:
                answers[
                  Math.floor(
                    Math.random() * answers.length
                  )
                ]
            }
          ])
        ]
      });
    }

    // kick
    if (i.commandName === "kick") {

      const user = i.options.getUser("user");
      const reason =
        i.options.getString("reason") ||
        "No reason";

      const member = await fetchMember(
        i.guild,
        user
      );

      if (!member || !member.kickable) {
        return i.reply({
          content: "❌ Cannot kick user",
          ephemeral: true
        });
      }

      await member.kick(reason);

      return i.reply({
        embeds: [
          embed("👢 Kicked", 0xe67e22, [
            {
              name: "User",
              value: user.tag
            },
            {
              name: "Reason",
              value: reason
            }
          ])
        ]
      });
    }

    // ban
    if (i.commandName === "ban") {

      const user = i.options.getUser("user");
      const reason =
        i.options.getString("reason") ||
        "No reason";

      await i.guild.members.ban(
        user.id,
        { reason }
      );

      return i.reply({
        embeds: [
          embed("🔨 Banned", 0xe74c3c)
        ]
      });
    }

    // unban
    if (i.commandName === "unban") {

      const id =
        i.options.getString("userid");

      await i.guild.bans.remove(id)
        .catch(() => {});

      return i.reply({
        embeds: [
          embed("✅ Unbanned", 0x2ecc71)
        ]
      });
    }

    // timeout
    if (i.commandName === "timeout") {

      const user = i.options.getUser("user");
      const mins =
        i.options.getInteger("minutes");

      const reason =
        i.options.getString("reason") ||
        "No reason";

      const member = await fetchMember(
        i.guild,
        user
      );

      if (!member) {
        return i.reply({
          content: "❌ User not found",
          ephemeral: true
        });
      }

      await member.timeout(
        mins * 60000,
        reason
      );

      return i.reply({
        embeds: [
          embed("⏳ Timed Out", 0xf1c40f)
        ]
      });
    }

    // untimeout
    if (i.commandName === "untimeout") {

      const user = i.options.getUser("user");

      const member = await fetchMember(
        i.guild,
        user
      );

      if (!member) {
        return i.reply({
          content: "❌ User not found",
          ephemeral: true
        });
      }

      await member.timeout(null);

      return i.reply({
        embeds: [
          embed("✅ Timeout Removed", 0x2ecc71)
        ]
      });
    }

    // warn
    if (i.commandName === "warn") {

      const user = i.options.getUser("user");
      const reason =
        i.options.getString("reason");

      if (!warns[user.id]) {
        warns[user.id] = [];
      }

      warns[user.id].push(reason);

      saveJSON(WARNS_FILE, warns);

      return i.reply({
        embeds: [
          embed("⚠ Warned", 0xf1c40f)
        ]
      });
    }

    // unwarn
    if (i.commandName === "unwarn") {

      const user = i.options.getUser("user");

      if (
        !warns[user.id] ||
        warns[user.id].length === 0
      ) {
        return i.reply({
          content: "❌ No warnings",
          ephemeral: true
        });
      }

      warns[user.id].pop();

      saveJSON(WARNS_FILE, warns);

      return i.reply({
        embeds: [
          embed("🧹 Warning Removed", 0x2ecc71)
        ]
      });
    }

    // warnings
    if (i.commandName === "warnings") {

      const user = i.options.getUser("user");

      return i.reply({
        embeds: [
          embed("📊 Warnings", 0x3498db, [
            {
              name: user.tag,
              value:
                warns[user.id]?.join("\n") ||
                "None"
            }
          ])
        ]
      });
    }

    // purge
    if (i.commandName === "purge") {

      const amount =
        i.options.getInteger("amount");

      if (amount < 1 || amount > 100) {
        return i.reply({
          content: "❌ Must be 1-100",
          ephemeral: true
        });
      }

      await i.channel.bulkDelete(
        amount,
        true
      );

      return i.reply({
        embeds: [
          embed("🧹 Purged", 0xe67e22)
        ],
        ephemeral: true
      });
    }

    // setnick
    if (i.commandName === "setnick") {

      const user = i.options.getUser("user");
      const nick =
        i.options.getString("nickname");

      const member = await fetchMember(
        i.guild,
        user
      );

      if (!member || !member.manageable) {
        return i.reply({
          content:
            "❌ Cannot change nickname",
          ephemeral: true
        });
      }

      await member.setNickname(nick);

      return i.reply({
        embeds: [
          embed("✏ Nickname Updated", 0x3498db)
        ]
      });
    }

    // addrole
    if (i.commandName === "addrole") {

      const user = i.options.getUser("user");
      const role = i.options.getRole("role");

      const member = await fetchMember(
        i.guild,
        user
      );

      if (
        !member ||
        !role ||
        !role.editable
      ) {
        return i.reply({
          content:
            "❌ Cannot add role",
          ephemeral: true
        });
      }

      await member.roles.add(role);

      return i.reply({
        embeds: [
          embed("🎭 Role Added", 0x2ecc71)
        ]
      });
    }

    // antiraid
    if (i.commandName === "antiraid") {

      const sub =
        i.options.getSubcommand();

      if (sub === "setup") {

        const g = getGuild(i.guild.id);

        return i.reply(
          raidPanel(g)
        );
      }
    }

  } catch (err) {

    console.error(err);

    try {
      if (!i.replied) {
        await i.reply({
          content: "❌ Error occurred",
          ephemeral: true
        });
      }
    } catch {}
  }
});

// ================================
// LOGIN
// ================================

client.login(process.env.TOKEN);
