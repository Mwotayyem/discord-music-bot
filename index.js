/**
 * 🎵 بوت ديسكورد للموسيقى والردود التلقائية
 * Discord Music Bot with Auto Responses
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, ChannelType, PermissionFlagsBits, Events, AttachmentBuilder } = require('discord.js');
const { autoResponses } = require('./config/responses');
const musicCommands = require('./commands/music');
const { createWelcomeCard } = require('./utils/welcomeCard');

// إنشاء العميل مع الصلاحيات المطلوبة
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// البادئة للأوامر
const PREFIX = process.env.PREFIX || '!';
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const WELCOME_BANNER_URL = process.env.WELCOME_BANNER_URL;
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID;
const WELCOME_COLOR = parseHexColor(process.env.WELCOME_COLOR, 0x5865F2);
const voiceWelcomeCooldowns = new Map();
const helloCounts = new Map();
const VOICE_WELCOME_COOLDOWN_MS = 15000;

// عند تشغيل البوت
client.once(Events.ClientReady, () => {
    console.log('═══════════════════════════════════════');
    console.log(`🤖 البوت جاهز! تم تسجيل الدخول كـ ${client.user.tag}`);
    console.log(`📊 متصل بـ ${client.guilds.cache.size} سيرفر`);
    console.log(`🎵 البادئة: ${PREFIX}`);
    console.log('═══════════════════════════════════════');

    // تعيين حالة البوت
    client.user.setActivity(`🎵 اكتب ${PREFIX}help`, { type: ActivityType.Listening });
});

// عند استقبال رسالة
client.on('messageCreate', async (message) => {
    // تجاهل رسائل البوتات
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();

    // ═══════════════════════════════════════
    // الأوامر (تتم معالجتها أولاً)
    // ═══════════════════════════════════════

    if (message.content.startsWith(PREFIX)) {
        const { command, args } = parseCommandInput(message.content);

        switch (command) {
            // أوامر المساعدة
            case 'help':
            case 'مساعدة':
            case 'اوامر':
                sendHelpEmbed(message);
                return;

            // أوامر الموسيقى
            case 'play':
            case 'p':
            case 'شغل':
            case 'تشغيل':
                musicCommands.playCommand(message, args);
                return;

            case 'skip':
            case 's':
            case 'تخطي':
            case 'التالي':
                musicCommands.skipCommand(message);
                return;

            case 'stop':
            case 'ايقاف':
            case 'وقف':
                musicCommands.stopCommand(message);
                return;

            case 'pause':
            case 'توقف':
                musicCommands.pauseCommand(message);
                return;

            case 'resume':
            case 'استمر':
            case 'كمل':
                musicCommands.resumeCommand(message);
                return;

            case 'queue':
            case 'q':
            case 'قائمة':
            case 'القائمة':
                musicCommands.queueCommand(message);
                return;

            case 'join':
            case 'انضم':
            case 'تعال':
                musicCommands.joinCommand(message);
                return;

            case 'leave':
            case 'اخرج':
            case 'غادر':
            case 'روح':
                musicCommands.leaveCommand(message);
                return;

            // أوامر الترفيه
            case 'ping':
            case 'بنق':
                message.reply(`🏓 Pong! التأخير: ${client.ws.ping}ms`);
                return;

            case 'info':
            case 'معلومات':
                sendInfoEmbed(message);
                return;
        }
    }

    // ═══════════════════════════════════════
    // الردود التلقائية (بعد الأوامر)
    // ═══════════════════════════════════════

    if (content.includes('مرحبا') || content.includes('مرحبه')) {
        const userId = message.author.id;
        const count = helloCounts.get(userId) || 0;

        if (count === 0) {
            message.reply('شدك !!! وليش جاي!! 🤨');
            helloCounts.set(userId, 1);
        } else if (count === 1) {
            message.reply('" كس اخت مرحبا " شو الي بدك اياه 🤬');
            helloCounts.set(userId, 2);
        } else {
            message.reply('يلعن شراميطها امك 🤬');
        }

        return;
    }

    for (const [trigger, response] of Object.entries(autoResponses)) {
        if (trigger.includes('مرحبا') || trigger.includes('مرحبه')) continue;

        if (content.includes(trigger.toLowerCase())) {
            message.reply(typeof response === 'function' ? response(message) : response);
            return; // الرد على أول كلمة مطابقة فقط
        }
    }
});

// ═══════════════════════════════════════
// الترحيب عند دخول عضو جديد للسيرفر
// ═══════════════════════════════════════
client.on('guildMemberAdd', async (member) => {
    const textChannel = pickWelcomeChannel(member.guild);
    if (!textChannel) return;

    await giveAutoRole(member);

    const payload = await buildServerWelcomePayload(member);

    textChannel.send(payload).catch((error) => {
        console.error('❌ Welcome message error:', error.message);
    });
});

// ═══════════════════════════════════════
// الترحيب عند دخول الروم الصوتي
// ═══════════════════════════════════════
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channelId || !newState.channelId || !newState.member) return;
    if (newState.member.user.bot) return;

    const cooldownKey = `${newState.guild.id}:${newState.member.id}`;
    const lastWelcome = voiceWelcomeCooldowns.get(cooldownKey) || 0;
    if (Date.now() - lastWelcome < VOICE_WELCOME_COOLDOWN_MS) return;
    voiceWelcomeCooldowns.set(cooldownKey, Date.now());

    const textChannel = pickWelcomeChannel(newState.guild);
    if (!textChannel) return;

    const payload = await buildVoiceWelcomePayload(newState.member, newState.channel);

    textChannel.send(payload).catch((error) => {
        console.error('❌ Voice welcome error:', error.message);
    });
});

function pickWelcomeChannel(guild) {
    const configuredChannel = WELCOME_CHANNEL_ID ? guild.channels.cache.get(WELCOME_CHANNEL_ID) : null;
    if (isUsableTextChannel(configuredChannel)) return configuredChannel;

    const preferredNames = ['welcome', 'ترحيب', 'الترحيب', 'general', 'chat', 'عام', 'شات'];
    const namedChannel = guild.channels.cache.find((channel) => {
        if (!isUsableTextChannel(channel)) return false;
        const channelName = channel.name.toLowerCase();
        return preferredNames.some((name) => channelName.includes(name));
    });

    if (namedChannel) return namedChannel;
    if (isUsableTextChannel(guild.systemChannel)) return guild.systemChannel;

    return guild.channels.cache.find(isUsableTextChannel);
}

function isUsableTextChannel(channel) {
    if (!channel || channel.type !== ChannelType.GuildText) return false;

    const me = channel.guild.members.me;
    if (!me) return true;

    const permissions = channel.permissionsFor(me);
    return permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ]);
}

async function giveAutoRole(member) {
    if (!AUTO_ROLE_ID || member.user.bot) return;

    try {
        await member.roles.add(AUTO_ROLE_ID, 'Auto role for new members');
    } catch (error) {
        console.error('❌ Auto role error:', error.message);
    }
}

async function buildServerWelcomePayload(member) {
    try {
        const cardBuffer = await createWelcomeCard(member);
        const attachment = new AttachmentBuilder(cardBuffer, {
            name: 'welcome-card.png'
        });
        const memberNumber = formatOrdinal(member.guild.memberCount || 1);

        return {
            content: `Welcome ${member} to **${member.guild.name}**! You are the **${memberNumber}** member!`,
            files: [attachment]
        };
    } catch (error) {
        console.error('❌ Welcome card error:', error.message);
        const memberNumber = formatOrdinal(member.guild.memberCount || 1);

        return {
            content: `Welcome ${member} to **${member.guild.name}**! You are the **${memberNumber}** member!`,
            embeds: [buildServerWelcomeEmbed(member)]
        };
    }
}

async function buildVoiceWelcomePayload(member, voiceChannel) {
    try {
        const cardBuffer = await createWelcomeCard(member, {
            eyebrow: 'VOICE JOIN',
            title: cleanDisplayName(member.displayName),
            subtitle: 'joined the voice channel',
            detail: 'Ready for music'
        });
        const attachment = new AttachmentBuilder(cardBuffer, {
            name: 'voice-welcome-card.png'
        });

        return {
            content: `🎧 ${member} دخل روم **${voiceChannel.name}**`,
            files: [attachment]
        };
    } catch (error) {
        console.error('❌ Voice welcome card error:', error.message);

        return {
            embeds: [buildVoiceWelcomeEmbed(member, voiceChannel)]
        };
    }
}

function buildServerWelcomeEmbed(member) {
    const displayName = cleanDisplayName(member.displayName);
    const createdAt = Math.floor(member.user.createdTimestamp / 1000);
    const memberNumber = member.guild.memberCount ? `#${member.guild.memberCount}` : 'عضو جديد';

    const embed = new EmbedBuilder()
        .setColor(WELCOME_COLOR)
        .setAuthor({
            name: `Welcome to ${member.guild.name}`,
            iconURL: member.guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(`╭── أهلاً ${displayName} ──╮`)
        .setDescription([
            `يا هلا ${member}، نورت السيرفر.`,
            '',
            `**${decorateName(displayName)}**`,
            '',
            'نتمنى لك وقت ممتع، شاركنا جوك وخذ راحتك بين أهلك.'
        ].join('\n'))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'العضو', value: member.user.tag, inline: true },
            { name: 'ترتيب الدخول', value: memberNumber, inline: true },
            { name: 'الحساب', value: `<t:${createdAt}:R>`, inline: true }
        )
        .setFooter({ text: 'استمتع بالموسيقى والجو الجميل' })
        .setTimestamp();

    if (WELCOME_BANNER_URL) {
        embed.setImage(WELCOME_BANNER_URL);
    }

    return embed;
}

function buildVoiceWelcomeEmbed(member, voiceChannel) {
    const displayName = cleanDisplayName(member.displayName);

    return new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🎧 دخول للروم الصوتي')
        .setDescription([
            `**${decorateName(displayName)}**`,
            '',
            `${member} دخل روم **${voiceChannel.name}**.`,
            'جاهزين للموسيقى؟'
        ].join('\n'))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
        .setFooter({ text: 'اكتب أمر تشغيل أغنية داخل الشات' })
        .setTimestamp();
}

function decorateName(name) {
    return `╔══ ${name} ══╗`;
}

function formatOrdinal(number) {
    const value = Number(number);
    const lastTwoDigits = value % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${value}th`;

    switch (value % 10) {
        case 1:
            return `${value}st`;
        case 2:
            return `${value}nd`;
        case 3:
            return `${value}rd`;
        default:
            return `${value}th`;
    }
}

function cleanDisplayName(name) {
    return name
        .replace(/[`*_~|\\]/g, '')
        .slice(0, 40);
}

function parseHexColor(value, fallback) {
    if (!value) return fallback;

    const normalized = value.replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;

    return parseInt(normalized, 16);
}

function parseCommandInput(rawContent) {
    const input = rawContent.slice(PREFIX.length).trim();
    const aliases = [
        'السلامة',
        'معلومات',
        'مساعدة',
        'تشغيل',
        'التالي',
        'القائمة',
        'ايقاف',
        'استمر',
        'تخطي',
        'توقف',
        'اوامر',
        'انضم',
        'تعال',
        'اخرج',
        'غادر',
        'روح',
        'بنق',
        'شغل',
        'play',
        'help',
        'skip',
        'stop',
        'pause',
        'resume',
        'queue',
        'join',
        'leave',
        'info',
        'ping',
        'p',
        's',
        'q'
    ].sort((a, b) => b.length - a.length);

    const lowerInput = input.toLowerCase();

    for (const alias of aliases) {
        if (!lowerInput.startsWith(alias)) continue;

        const rest = input.slice(alias.length).trim();
        const lowerRest = rest.toLowerCase();
        const validBoundary = !rest
            || /^\s/.test(input.charAt(alias.length))
            || /^["'`“”«»]/.test(rest)
            || lowerRest.startsWith('http://')
            || lowerRest.startsWith('https://')
            || lowerRest.startsWith('www.');

        if (!validBoundary) continue;

        return {
            command: alias,
            args: rest ? [stripWrappingQuotes(rest)] : []
        };
    }

    const args = input.split(/ +/);
    return {
        command: (args.shift() || '').toLowerCase(),
        args
    };
}

function stripWrappingQuotes(value) {
    return value
        .trim()
        .replace(/^[`"'“”«»]+/, '')
        .replace(/[`"'“”«»]+$/, '')
        .trim();
}

/**
 * إرسال رسالة المساعدة
 */
function sendHelpEmbed(message) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎵 أوامر البوت')
        .setDescription('مرحباً! هذه قائمة بجميع الأوامر المتاحة:')
        .addFields(
            {
                name: '🎶 أوامر الموسيقى',
                value:
                    `\`${PREFIX}play [رابط يوتيوب]\` أو \`${PREFIX}شغل\` - تشغيل أغنية من رابط
\`${PREFIX}skip\` أو \`${PREFIX}تخطي\` - تخطي الأغنية الحالية
\`${PREFIX}stop\` أو \`${PREFIX}ايقاف\` - إيقاف الموسيقى والمغادرة
\`${PREFIX}pause\` أو \`${PREFIX}توقف\` - إيقاف مؤقت
\`${PREFIX}resume\` أو \`${PREFIX}استمر\` - استئناف التشغيل
\`${PREFIX}queue\` أو \`${PREFIX}قائمة\` - عرض قائمة الأغاني
\`${PREFIX}join\` أو \`${PREFIX}تعال\` - الانضمام للقناة الصوتية
\`${PREFIX}leave\` أو \`${PREFIX}اخرج\` - مغادرة القناة الصوتية`,
                inline: false
            },
            {
                name: '🤖 أوامر عامة',
                value:
                    `\`${PREFIX}help\` أو \`${PREFIX}مساعدة\` - عرض هذه القائمة
\`${PREFIX}ping\` أو \`${PREFIX}بنق\` - فحص سرعة البوت
\`${PREFIX}info\` أو \`${PREFIX}معلومات\` - معلومات عن البوت`,
                inline: false
            },
            {
                name: '💬 الردود التلقائية',
                value: 'البوت يرد تلقائياً على: مرحبا، السلام عليكم، هلا، صباح الخير، شكرا، وغيرها!',
                inline: false
            }
        )
        .setFooter({ text: '💜 بوت الموسيقى | قناة التيم' })
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
}

/**
 * إرسال معلومات البوت
 */
function sendInfoEmbed(message) {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🤖 معلومات البوت')
        .addFields(
            { name: '📛 الاسم', value: client.user.username, inline: true },
            { name: '📊 السيرفرات', value: `${client.guilds.cache.size}`, inline: true },
            { name: '👥 المستخدمين', value: `${client.users.cache.size}`, inline: true },
            { name: '🏓 التأخير', value: `${client.ws.ping}ms`, inline: true },
            { name: '⏱️ وقت التشغيل', value: formatUptime(client.uptime), inline: true },
            { name: '💻 Node.js', value: process.version, inline: true }
        )
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: '💜 تم التطوير بـ ❤️' })
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
}

/**
 * تنسيق وقت التشغيل
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} يوم`;
    if (hours > 0) return `${hours} ساعة`;
    if (minutes > 0) return `${minutes} دقيقة`;
    return `${seconds} ثانية`;
}

// تسجيل الدخول
client.login(process.env.DISCORD_TOKEN);
