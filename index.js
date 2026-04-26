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
  AuditLogEvent,
  ChannelType
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

// ───────── SAFE DB ─────────

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

const embed = (t, c, f=[]) => {
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
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban user")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout user")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setDescription("Minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setnick")
    .setDescription("Set nickname")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o=>o.setName("nickname").setDescription("Nickname").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add role")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn user")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Setup anti raid")
    .addSubcommand(s=>s.setName("setup").setDescription("Enable anti raid")),

  new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Setup anti nuke")
    .addSubcommand(s=>s.setName("setup").setDescription("Enable anti nuke"))

].map(c=>c.toJSON());

// ───────── READY ─────────

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.application.id),
    { body: commands }
  );

  client.user.setPresence({
    activities: [{ name: "Protecting servers", type: ActivityType.Watching }]
  });

  console.log("✅ READY");
});

// ───────── SAFE REPLY ─────────

async function safeReply(i, data) {
  if (i.replied || i.deferred) return i.followUp(data);
  return i.reply(data);
}

// ───────── INTERACTIONS ─────────

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand() || !i.guild) return;

  const guild = i.guild;
  const member = await guild.members.fetch(i.user.id).catch(()=>null);

  if (!member)
    return safeReply(i, { content:"❌ Member error", ephemeral:true });

  try {

    if (i.commandName === "ping")
      return safeReply(i, { embeds:[embed("🏓 Pong",0x2ecc71)] });

    if (i.commandName === "help")
      return safeReply(i, { embeds:[embed("Commands",0x3498db)] });

    // PERM CHECK PER COMMAND
    const perms = {
      kick: PermissionsBitField.Flags.KickMembers,
      ban: PermissionsBitField.Flags.BanMembers,
      timeout: PermissionsBitField.Flags.ModerateMembers,
      purge: PermissionsBitField.Flags.ManageMessages,
      addrole: PermissionsBitField.Flags.ManageRoles,
      setnick: PermissionsBitField.Flags.ManageNicknames
    };

    if (perms[i.commandName] &&
        !member.permissions.has(perms[i.commandName]))
      return safeReply(i, { content:"❌ No permission", ephemeral:true });

    const targetUser = i.options.getUser("user");

    let target = null;
    if (targetUser)
      target = await guild.members.fetch(targetUser.id).catch(()=>null);

    // HIERARCHY CHECK
    const botMember = guild.members.me;

    if (target && botMember.roles.highest.position <= target.roles.highest.position)
      return safeReply(i, { content:"❌ Role hierarchy", ephemeral:true });

    // COMMANDS

    if (i.commandName === "kick") {
      if (!target || !target.kickable)
        return safeReply(i, { content:"❌ Can't kick", ephemeral:true });

      await target.kick();
      return safeReply(i, { embeds:[embed("👢 Kicked",0xe67e22)] });
    }

    if (i.commandName === "ban") {
      if (!targetUser)
        return safeReply(i, { content:"❌ Invalid user", ephemeral:true });

      await guild.members.ban(targetUser.id).catch(()=>{});
      return safeReply(i, { embeds:[embed("🔨 Banned",0xe74c3c)] });
    }

    if (i.commandName === "timeout") {
      const mins = i.options.getInteger("minutes");

      if (!target || mins < 1 || mins > 40320)
        return safeReply(i, { content:"❌ Invalid", ephemeral:true });

      await target.timeout(mins*60000).catch(()=>{});
      return safeReply(i, { embeds:[embed("⏳ Timed Out",0xf1c40f)] });
    }

    if (i.commandName === "setnick") {
      const nick = i.options.getString("nickname");

      if (!target || !target.manageable)
        return safeReply(i, { content:"❌ Can't edit", ephemeral:true });

      await target.setNickname(nick).catch(()=>{});
      return safeReply(i, { embeds:[embed("✏️ Nick Updated",0x3498db)] });
    }

    if (i.commandName === "addrole") {
      const role = i.options.getRole("role");

      if (!target || !role || !role.editable)
        return safeReply(i, { content:"❌ Can't add role", ephemeral:true });

      await target.roles.add(role).catch(()=>{});
      return safeReply(i, { embeds:[embed("➕ Role Added",0x2ecc71)] });
    }

    if (i.commandName === "warn") {
      const reason = i.options.getString("reason");

      warns[targetUser.id] ??= [];
      warns[targetUser.id].push(reason);
      saveWarns();

      return safeReply(i, { embeds:[embed("⚠️ Warned",0xf1c40f)] });
    }

    if (i.commandName === "warnings") {
      return safeReply(i, {
        embeds:[embed("Warnings",0x3498db,[
          {name:targetUser.tag,value:warns[targetUser.id]?.join("\n") || "None"}
        ])]
      });
    }

    if (i.commandName === "purge") {
      const amount = i.options.getInteger("amount");

      if (!i.channel || i.channel.type !== ChannelType.GuildText)
        return safeReply(i, { content:"❌ Not text channel", ephemeral:true });

      if (amount < 1 || amount > 100)
        return safeReply(i, { content:"❌ 1-100", ephemeral:true });

      await i.channel.bulkDelete(amount, true).catch(()=>{});
      return safeReply(i, { embeds:[embed("🧹 Purged",0xe67e22)], ephemeral:true });
    }

    if (i.commandName === "antiraid") {
      getGuild(guild.id).antiraid = true;
      saveConfig();
      return safeReply(i, { embeds:[embed("🛡 Enabled",0x2ecc71)] });
    }

    if (i.commandName === "antinuke") {
      getGuild(guild.id).antinuke = true;
      saveConfig();
      return safeReply(i, { embeds:[embed("💣 Enabled",0xe74c3c)] });
    }

  } catch (err) {
    console.error(err);
    safeReply(i, { content:"❌ Error", ephemeral:true });
  }
});

client.login(process.env.TOKEN);
