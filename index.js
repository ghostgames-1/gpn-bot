const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");

// ─────────────────────────────
// CLIENT
// ─────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
    )
    .toJSON()
];

// register slash commands
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (err) {
    console.error(err);
  }
});

// ─────────────────────────────
// BAN COMMAND
// ─────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ban") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: "No permission.", ephemeral: true });
    }

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "User not found.", ephemeral: true });
    }

    if (!member.bannable) {
      return interaction.reply({ content: "I can't ban this user.", ephemeral: true });
    }

    await member.ban({ reason });

    return interaction.reply(`🔨 Banned ${user.tag} | Reason: ${reason}`);
  }
});

// ─────────────────────────────
// YOUR PREFIX COMMANDS SYSTEM
// ─────────────────────────────

function normalizeUrl(input) {
  try {
    input = input.trim();
    if (input.startsWith("<") && input.endsWith(">")) input = input.slice(1, -1);

    const mdMatch = input.match(/\[.*?\]\((.+?)\)/);
    if (mdMatch) input = mdMatch[1];

    if (!/^https?:\/\//i.test(input)) input = "https://" + input;

    const parsed = new URL(input);

    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

    const hostname = parsed.hostname.replace(/^www\./, "");

    return { full: input, hostname };
  } catch {
    return null;
  }
}

// simple prefix system
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const prefix = "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // ─── ping
  if (cmd === "ping") {
    return message.reply("🏓 Pong!");
  }

  // ─── help
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("Commands")
      .setColor(0x5865F2)
      .addFields(
        { name: "!ping", value: "Check bot latency" },
        { name: "!say", value: "Make bot send a message (owner only)" },
        { name: "!checklink", value: "Check a URL" }
      );

    return message.reply({ embeds: [embed] });
  }

  // ─── say
  if (cmd === "say") {
    if (message.guild.ownerId !== message.author.id)
      return message.reply("Only owner can use this.");

    const text = args.join(" ");
    return message.channel.send(text);
  }

  // ─── checklink (simplified version of yours)
  if (cmd === "checklink") {
    const input = args.join(" ");
    const parsed = normalizeUrl(input);

    if (!parsed) {
      return message.reply("Invalid URL.");
    }

    return message.reply(`Checked: ${parsed.hostname}`);
  }

  // ─── ban (prefix version too if you want)
  if (cmd === "ban") {
    if (!message.member.permissions.has("BanMembers"))
      return message.reply("No permission.");

    const user = message.mentions.members.first();
    if (!user) return message.reply("Mention a user.");

    if (!user.bannable) return message.reply("Can't ban this user.");

    const reason = args.slice(1).join(" ") || "No reason";

    await user.ban({ reason });
    return message.reply(`Banned ${user.user.tag}`);
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

client.login(process.env.TOKEN);
