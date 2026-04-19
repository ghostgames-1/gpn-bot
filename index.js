const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, MessageFlags } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function normalizeUrl(input) {
  try {
    // Strip Discord's <url> suppression brackets and surrounding whitespace
    input = input.trim();
    if (input.startsWith('<') && input.endsWith('>')) input = input.slice(1, -1).trim();

    // Strip markdown link format [text](url)
    const mdMatch = input.match(/\[.*?\]\((.+?)\)/);
    if (mdMatch) input = mdMatch[1];

    // If there's no protocol at all, add https://
    if (!/^https?:\/\//i.test(input)) input = 'https://' + input;

    const parsed = new URL(input);

    // Must have a valid hostname with at least one dot (e.g. google.com)
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;

    // Strip www. and any trailing dots
    const hostname = parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');

    // Reconstruct a clean full URL (just scheme + hostname for display)
    const full = `${parsed.protocol}//${hostname}${parsed.pathname !== '/' ? parsed.pathname : ''}`;

    return { full, hostname };
  } catch {
    return null;
  }
}

// ─── Domain category lookup ──────────────────────────────────────────────────

const DOMAIN_CATEGORIES = {
  // Education
  'wikipedia.org': 'Education', 'khanacademy.org': 'Education',
  'coursera.org': 'Education', 'edx.org': 'Education',
  'duolingo.com': 'Education', 'quizlet.com': 'Education',
  'classroom.google.com': 'Education', 'schoology.com': 'Education',
  'clever.com': 'Education', 'brainly.com': 'Education',
  'chegg.com': 'Education', 'wolframalpha.com': 'Education',
  'britannica.com': 'Education', 'pbslearningmedia.org': 'Education',

  // Search Engines
  'google.com': 'Search Engines & Portals', 'bing.com': 'Search Engines & Portals',
  'duckduckgo.com': 'Search Engines & Portals', 'yahoo.com': 'Search Engines & Portals',
  'ask.com': 'Search Engines & Portals',

  // Social Networking
  'facebook.com': 'Social Networking', 'fb.com': 'Social Networking',
  'instagram.com': 'Social Networking', 'twitter.com': 'Social Networking',
  'x.com': 'Social Networking', 'snapchat.com': 'Social Networking',
  'tiktok.com': 'Social Networking', 'pinterest.com': 'Social Networking',
  'reddit.com': 'Social Networking', 'tumblr.com': 'Social Networking',
  'linkedin.com': 'Social Networking', 'threads.net': 'Social Networking',
  'bereal.com': 'Social Networking',

  // Streaming & Entertainment
  'youtube.com': 'Streaming Media & Downloads', 'youtu.be': 'Streaming Media & Downloads',
  'netflix.com': 'Streaming Media & Downloads', 'twitch.tv': 'Streaming Media & Downloads',
  'spotify.com': 'Streaming Media & Downloads', 'hulu.com': 'Streaming Media & Downloads',
  'disneyplus.com': 'Streaming Media & Downloads', 'soundcloud.com': 'Streaming Media & Downloads',
  'vimeo.com': 'Streaming Media & Downloads', 'dailymotion.com': 'Streaming Media & Downloads',
  'primevideo.com': 'Streaming Media & Downloads', 'crunchyroll.com': 'Streaming Media & Downloads',

  // Games
  'roblox.com': 'Games', 'minecraft.net': 'Games', 'steampowered.com': 'Games',
  'steam.com': 'Games', 'epicgames.com': 'Games', 'fortnite.com': 'Games',
  'chess.com': 'Games', 'poki.com': 'Games', 'coolmathgames.com': 'Games',
  'friv.com': 'Games', 'kongregate.com': 'Games', 'miniclip.com': 'Games',
  'addictinggames.com': 'Games', 'armorgames.com': 'Games', 'y8.com': 'Games',
  'scratch.mit.edu': 'Games', 'itch.io': 'Games', 'gameflare.com': 'Games',
  // Unblocked game sites commonly accessed at school
  'unblocked.games': 'Games', 'sites.google.com': 'Games',
  'classroom6x.com': 'Games', 'tyrone.io': 'Games', 'gamesjolt.com': 'Games',
  'kizi.com': 'Games', 'agame.com': 'Games', 'gamesgames.com': 'Games',
  'gamaverse.com': 'Games', 'tinyurl.com': 'Games',
  // io games
  'slither.io': 'Games', 'agar.io': 'Games', 'krunker.io': 'Games',
  'shellshock.io': 'Games', 'moomoo.io': 'Games', 'diep.io': 'Games',
  'surviv.io': 'Games', 'zombs.io': 'Games', 'ev.io': 'Games',
  '1v1.lol': 'Games', 'smash.io': 'Games',

  // Web-Based Applications & Productivity
  'discord.com': 'Web-Based Applications', 'slack.com': 'Web-Based Applications',
  'zoom.us': 'Web-Based Applications', 'meet.google.com': 'Web-Based Applications',
  'office.com': 'Web-Based Applications', 'notion.so': 'Web-Based Applications',
  'trello.com': 'Web-Based Applications', 'canva.com': 'Web-Based Applications',
  'figma.com': 'Web-Based Applications', 'replit.com': 'Web-Based Applications',
  'docs.google.com': 'Web-Based Applications', 'drive.google.com': 'Web-Based Applications',
  'sheets.google.com': 'Web-Based Applications', 'forms.google.com': 'Web-Based Applications',

  // Web Mail
  'gmail.com': 'Web Mail', 'outlook.com': 'Web Mail',
  'mail.google.com': 'Web Mail', 'protonmail.com': 'Web Mail',

  // Technology & Developer
  'github.com': 'Technology', 'stackoverflow.com': 'Technology',
  'npmjs.com': 'Technology', 'developer.mozilla.org': 'Technology',
  'cloudflare.com': 'Technology', 'aws.amazon.com': 'Technology',

  // News & Media
  'cnn.com': 'News & Media', 'bbc.com': 'News & Media', 'bbc.co.uk': 'News & Media',
  'nytimes.com': 'News & Media', 'theguardian.com': 'News & Media',
  'nbcnews.com': 'News & Media', 'foxnews.com': 'News & Media',
  'apnews.com': 'News & Media',

  // Shopping
  'amazon.com': 'Shopping', 'ebay.com': 'Shopping',
  'etsy.com': 'Shopping', 'walmart.com': 'Shopping',
};

function categorize(hostname) {
  const d = hostname.toLowerCase();

  // Exact match
  if (DOMAIN_CATEGORIES[d]) return DOMAIN_CATEGORIES[d];

  // Apex domain match (strip subdomains)
  const parts = d.split('.');
  if (parts.length > 2) {
    const apex = parts.slice(-2).join('.');
    if (DOMAIN_CATEGORIES[apex]) return DOMAIN_CATEGORIES[apex];
    // Handle co.uk / com.au style
    if (parts.length > 3) {
      const apex3 = parts.slice(-3).join('.');
      if (DOMAIN_CATEGORIES[apex3]) return DOMAIN_CATEGORIES[apex3];
    }
  }

  // Keyword detection — games checked FIRST so "unblockedgames" sites aren't misclassed as proxies
  if (
    /\bgames?\b|gaming|arcade|flashgame|playnow|playonline|freegame|browsergame/i.test(d) ||
    /\bplay\b.*\b(free|online|now)\b|\b(free|online)\b.*\bplay\b/i.test(d) ||
    /unblocked.{0,10}game|game.{0,10}unblocked|\d+unblocked|unblocked\d+/i.test(d) ||
    /classroom6x|tyrone|gamaverse|gamesjolt|coolmath/i.test(d) ||
    /\bfriv\b|\bpoki\b|\bkizi\b|\bagame\b|\by8\b|\bkongregate\b/i.test(d) ||
    (/\.io$/.test(d) && !/repl\.it|replit\.com|discord\.io|github\.io|google\.io/i.test(d)) ||
    /1v1|slither|krunker|shellshock|moomoo|zombs|surviv|diep|agar\./i.test(d)
  ) return 'Games';
  if (/proxy|proxies|vpn|bypass|unblock|unblocker|tunnel|anonymi|hide\.my|hidemy/i.test(d))
    return 'Proxies & Anonymizers';
  if (/porn|xxx|sex(?!y)|adult|nude|erotic|hentai|nsfw/i.test(d))
    return 'Adult/Explicit Content';
  if (/news|times|herald|tribune|journal|post\./i.test(d))
    return 'News & Media';
  if (/shop|store|mart|market|buy\.|-shop|-store/i.test(d))
    return 'Shopping';
  if (/mail\.|webmail/i.test(d))
    return 'Web Mail';

  // TLD-based fallback
  if (d.endsWith('.edu') || d.endsWith('.ac.uk') || d.endsWith('.edu.au'))
    return 'Education';
  if (d.endsWith('.gov') || d.endsWith('.gov.uk'))
    return 'Government';

  return 'General Web';
}

// Determine block reason when a content filter blocks a domain.
// familyFilter=true means blocked by Cloudflare Family (adult+malware),
// so unrecognised domains default to Adult/Explicit Content rather than Non-Managed.
function blockReason(hostname, familyFilter = false) {
  const d = hostname.toLowerCase();
  if (
    /\bgames?\b|gaming|arcade|flashgame|playnow|freegame|browsergame/i.test(d) ||
    /unblocked.{0,10}game|game.{0,10}unblocked|\d+unblocked|unblocked\d+/i.test(d) ||
    /classroom6x|tyrone|gamaverse|gamesjolt|coolmath/i.test(d) ||
    /\bfriv\b|\bpoki\b|\bkizi\b|\bagame\b|\by8\b|\bkongregate\b/i.test(d) ||
    (/\.io$/.test(d) && !/repl\.it|replit\.com|discord\.io|github\.io|google\.io/i.test(d)) ||
    /1v1|slither|krunker|shellshock|moomoo|zombs|surviv|diep|agar\./i.test(d)
  )                                                                             return 'Games';
  if (/proxy|proxies|vpn|bypass|unblock|unblocker|tunnel|anonymi/i.test(d))   return 'Proxies & Anonymizers';
  if (/porn|xxx|sex(?!y)|adult|nude|erotic|hentai|nsfw|lewd/i.test(d))        return 'Adult/Explicit Content';
  if (/torrent|pirate|crack|warez|keygen/i.test(d))                           return 'Illegal Downloads';
  if (/hack|exploit|vuln|inject/i.test(d))                                    return 'Hacking & Exploits';
  if (/bet|casino|poker|gambl/i.test(d))                                      return 'Gambling';
  // Cloudflare Family blocks adult content by default — unknown blocked domains are likely adult
  return familyFilter ? 'Adult/Explicit Content' : 'Non-Managed';
}

// ─── Filter check functions ───────────────────────────────────────────────────

async function dohLookup(endpoint, hostname) {
  try {
    const res = await fetch(
      `${endpoint}?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(7000) }
    );
    const data = await res.json();
    const ips = (data.Answer || []).filter(a => a.type === 1).map(a => a.data);
    const blocked = data.Status === 3 || ips.length === 0 || ips.every(ip => ip === '0.0.0.0' || ip === '::');
    return { blocked };
  } catch {
    return { blocked: null };
  }
}

async function checkGoogleSafeBrowsing(hostname) {
  try {
    const res = await fetch(
      `https://transparencyreport.google.com/transparencyreport/api/v3/safebrowsing/status?site=${encodeURIComponent(hostname)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) }
    );
    const raw = await res.text();
    const json = JSON.parse(raw.replace(/^\)\]\}'\n/, ''));
    const data = json[0];
    const threats = [];
    if (data[2]) threats.push('Malware');
    if (data[3]) threats.push('Phishing');
    if (data[4]) threats.push('Unwanted Software');
    if (data[5]) threats.push('Harmful Content');
    if (threats.length > 0) return { blocked: true,  category: threats.join(' / ') };
    return                         { blocked: false, category: categorize(hostname) };
  } catch {
    return                         { blocked: null,  category: 'Unavailable' };
  }
}

async function checkCloudflareSecurity(hostname) {
  const r = await dohLookup('https://security.cloudflare-dns.com/dns-query', hostname);
  if (r.blocked === null)   return { blocked: null,  category: 'Unavailable' };
  if (r.blocked)            return { blocked: true,  category: 'Malware / Phishing Domain' };
  return                           { blocked: false, category: categorize(hostname) };
}

async function checkCloudflareFamilies(hostname) {
  const r = await dohLookup('https://family.cloudflare-dns.com/dns-query', hostname);
  if (r.blocked === null)   return { blocked: null,  category: 'Unavailable' };
  if (r.blocked)            return { blocked: true,  category: blockReason(hostname, true) };
  return                           { blocked: false, category: categorize(hostname) };
}

// Filters with emoji, name, and their check function
const FILTERS = [
  { emoji: '🛡️',  name: 'FortiGuard',     check: checkCloudflareFamilies  },
  { emoji: '⚡',  name: 'Lightspeed',      check: checkCloudflareSecurity  },
  { emoji: '🔑',  name: 'Securly',         check: checkCloudflareFamilies  },
  { emoji: '👁️',  name: 'GoGuardian',      check: checkGoogleSafeBrowsing  },
  { emoji: '🗂️',  name: 'Content Keeper',  check: checkCloudflareFamilies  },
  { emoji: '🛰️',  name: 'Linewize',        check: checkCloudflareSecurity  },
];

const COMMANDS = [
  { name: 'ping', description: 'Check if the bot is alive' },
  { name: 'help', description: 'List all available commands' },
  {
    name: 'say',
    description: 'Make the bot send a message (server owner only)',
    options: [{ name: 'message', description: 'The message to send', type: 3, required: true }]
  },
  {
    name: 'checklink',
    description: 'Check if a URL is blocked by school content filters',
    options: [{ name: 'url', description: 'The URL to check (e.g. youtube.com)', type: 3, required: true }]
  }
];

async function registerCommandsForGuild(rest, appId, guild) {
  await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: COMMANDS });
  console.log(`Commands registered in: ${guild.name}`);
}

client.once('clientReady', async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const rest = new REST().setToken(process.env.TOKEN);

  // Clear all global commands to remove duplicates
  await rest.put(Routes.applicationCommands(c.user.id), { body: [] });
  console.log('Global commands cleared');

  // Register guild commands (instant) for every server
  for (const guild of c.guilds.cache.values()) {
    await registerCommandsForGuild(rest, c.user.id, guild);
  }
});

client.on('guildCreate', async (guild) => {
  const rest = new REST().setToken(process.env.TOKEN);
  await registerCommandsForGuild(rest, client.user.id, guild);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === 'ping') {
    const latency = Date.now() - interaction.createdTimestamp;
    return interaction.reply(`🏓 Pong! Latency: **${latency}ms**`);
  }

  // /help
  if (interaction.commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Commands')
      .setColor(0x5865F2)
      .addFields(
        { name: '/ping',      value: 'Check if the bot is alive',                         inline: false },
        { name: '/say',       value: 'Make the bot send a message *(server owner only)*', inline: false },
        { name: '/checklink', value: 'Check if a URL is blocked by school filters',        inline: false },
        { name: '/help',      value: 'Show this help message',                             inline: false }
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /say — server owner only
  if (interaction.commandName === 'say') {
    if (interaction.guild?.ownerId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the server owner can use this command.', flags: MessageFlags.Ephemeral });
    }
    const text = interaction.options.getString('message');
    await interaction.reply({ content: '✅ Sent!', flags: MessageFlags.Ephemeral });
    return interaction.channel.send(text);
  }

  // /checklink
  if (interaction.commandName === 'checklink') {
    const input = interaction.options.getString('url');
    const parsed = normalizeUrl(input);

    if (!parsed) {
      return interaction.reply({
        content: "❌ That doesn't look like a valid URL. Try something like `youtube.com` or `https://example.com`",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();

    const results = await Promise.all(
      FILTERS.map(async (f) => {
        const result = await f.check(parsed.hostname);
        return { ...f, ...result };
      })
    );

    const unblocked = results.filter(r => r.blocked === false).length;
    const blocked   = results.filter(r => r.blocked === true).length;
    const anyBlocked = blocked > 0;
    const embedColor = anyBlocked ? 0xED4245 : 0x57F287;

    const lines = results.map(r => {
      const icon = r.blocked === true ? '❌' : r.blocked === false ? '✅' : '⚠️';
      return `${r.emoji} **${r.name}** (${r.category}) ${icon}`;
    });

    lines.push('');
    lines.push(`${unblocked} unblocked · ${blocked} blocked · Settings reflect global configuration.`);

    const embed = new EmbedBuilder()
      .setTitle(`Results for ${parsed.hostname}`)
      .setDescription(lines.join('\n'))
      .setColor(embedColor)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Slash command
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

// Register command
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("Slash command registered");
  } catch (err) {
    console.error(err);
  }
});

// Handle command
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ban") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: "You don't have permission to ban members.", ephemeral: true });
    }

    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "User not found in this server.", ephemeral: true });
    }

    if (!member.bannable) {
      return interaction.reply({ content: "I can't ban this user (role hierarchy issue).", ephemeral: true });
    }

    await member.ban({ reason });
    return interaction.reply(`🔨 Banned ${user.tag} | Reason: ${reason}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
