const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// load commands
const commands = [];
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commands.push(command.data.toJSON());
}

// register commands
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Commands loaded");
});

// interaction handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "Error executing command.", ephemeral: true });
    }
  }
});

// ───────── AUTO MODERATION ─────────
const bannedWords = ["badword1", "badword2"];

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  // block bad words
  if (bannedWords.some(word => message.content.toLowerCase().includes(word))) {
    message.delete();
    message.channel.send(`${message.author}, that word is not allowed.`);
  }

  // block links (simple)
  if (message.content.includes("http")) {
    message.delete();
    message.channel.send(`${message.author}, links are not allowed.`);
  }
});

client.login(process.env.TOKEN);
