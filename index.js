/**
 * 🎵 بوت ديسكورد للموسيقى والردود التلقائية
 * Discord Music Bot with Auto Responses
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { autoResponses } = require('./config/responses');
const musicCommands = require('./commands/music');

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

// عند تشغيل البوت
client.once('ready', () => {
    console.log('═══════════════════════════════════════');
    console.log(`🤖 البوت جاهز! تم تسجيل الدخول كـ ${client.user.tag}`);
    console.log(`📊 متصل بـ ${client.guilds.cache.size} سيرفر`);
    console.log(`🎵 البادئة: ${PREFIX}`);
    console.log('═══════════════════════════════════════');

    // تعيين حالة البوت
    client.user.setActivity('🎵 اكتب !help', { type: ActivityType.Listening });
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
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

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

    // ذاكرة مؤقتة لتعسيب البوت 😂
    if (!client.helloCounts) client.helloCounts = new Map();

    if (content.includes('مرحبا') || content.includes('مرحبه')) {
        const userId = message.author.id;
        const count = client.helloCounts.get(userId) || 0;

        if (count === 0) {
            message.reply('اهلا وسهلا بك في قناة التيم! 🎉');
            client.helloCounts.set(userId, 1);
        } else if (count === 1) {
            message.reply('اهلين هسه جاي');
            client.helloCounts.set(userId, 2);
        } else {
            message.reply('اسب ام مرحبا وبعدين 😤');
            // يمكننا تصفير العداد بعد فترة إذا أردت
            // client.helloCounts.set(userId, 0); 
        }
        return;
    }

    for (const [trigger, response] of Object.entries(autoResponses)) {
        // نتخطى مرحبا لأننا تعاملنا معها فوق
        if (trigger.includes('مرحبا') || trigger.includes('مرحبه')) continue;

        if (content.includes(trigger.toLowerCase())) {
            message.reply(response);
            return; // الرد على أول كلمة مطابقة فقط
        }
    }
});

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
                    `\`${PREFIX}play [اسم/رابط]\` أو \`${PREFIX}شغل\` - تشغيل أغنية
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
