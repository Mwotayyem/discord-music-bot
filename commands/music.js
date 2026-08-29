const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior,
    StreamType
} = require('@discordjs/voice');
const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

// تحديد مسار yt-dlp
const ytDlpPath = path.join(process.cwd(), 'yt-dlp.exe');
const execFileAsync = promisify(execFile);
const ytdlpCookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
const ytdlpCookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
const ytdlpJsRuntime = process.env.YTDLP_JS_RUNTIME?.trim() || 'node';
const ytdlpExtractorArgs = process.env.YTDLP_EXTRACTOR_ARGS?.trim() || 'youtube:player_client=android';

// تخزين مشغلات الصوت لكل سيرفر
const queues = new Map();

/**
 * الحصول على قائمة الانتظار للسيرفر
 */
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            songs: [],
            player: null,
            connection: null,
            playing: false,
            volume: 100,
            textChannel: null
        });
    }
    return queues.get(guildId);
}

async function runYtDlp(args) {
    const { stdout } = await execFileAsync(ytDlpPath, [
        ...getYtDlpBaseArgs(),
        ...args
    ], {
        maxBuffer: 1024 * 1024 * 20
    });

    return stdout;
}

function getYtDlpBaseArgs() {
    const args = [
        '--no-config',
        '--js-runtimes', ytdlpJsRuntime,
        '--extractor-args', ytdlpExtractorArgs,
        '--extractor-retries', '5',
        '--retry-sleep', 'extractor:linear=1:4:1'
    ];

    if (ytdlpCookiesFromBrowser) {
        args.push('--cookies-from-browser', ytdlpCookiesFromBrowser);
    } else if (ytdlpCookiesFile) {
        args.push('--cookies', ytdlpCookiesFile);
    }

    return args;
}

function parseYtDlpJson(output) {
    const trimmedOutput = output.trim();

    try {
        return JSON.parse(trimmedOutput);
    } catch (error) {
        const firstJsonLine = trimmedOutput
            .split(/\r?\n/)
            .find((line) => line.trim().startsWith('{'));

        if (!firstJsonLine) throw error;
        return JSON.parse(firstJsonLine);
    }
}

function getFriendlyYtDlpError(error) {
    const details = `${error.stderr || ''}\n${error.stdout || ''}\n${error.message || ''}`;

    if (/sign in to confirm|not a bot|too many requests|HTTP Error 429/i.test(details)) {
        return [
            'يوتيوب طلب تحقق وما سمح للبوت يسحب الصوت.',
            'الحل الأقوى هو تفعيل cookies من متصفحك في `.env`، لكن هذا يسمح لـ yt-dlp بقراءة جلسة YouTube من المتصفح.',
            'بعد موافقتك، يمكن ضبط `YTDLP_COOKIES_FROM_BROWSER=chrome` أو `edge` ثم تعيد تشغيل البوت.'
        ].join('\n');
    }

    if (/cookies/i.test(details)) {
        return 'حدثت مشكلة في قراءة cookies المتصفح. أغلق المتصفح بالكامل ثم أعد تشغيل البوت، أو جرّب تغيير المتصفح في `.env`.';
    }

    return error.message;
}

function extractUrl(value) {
    const match = String(value).match(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/i);
    if (!match) return null;

    const url = match[0].replace(/[.,;!?]+$/, '');
    return url.startsWith('www.') ? `https://${url}` : url;
}

function isYouTubeUrl(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');

        return host === 'youtube.com'
            || host === 'youtu.be'
            || host === 'm.youtube.com'
            || host === 'music.youtube.com';
    } catch (error) {
        return false;
    }
}

/**
 * تشغيل أغنية
 */
async function playSong(guildId, song) {
    const queue = queues.get(guildId);

    if (!queue) return;

    if (!song) {
        queue.playing = false;
        // ننتظر قليلاً قبل قطع الاتصال
        setTimeout(() => {
            if (queue.connection && !queue.playing) {
                queue.connection.destroy();
                queue.connection = null;
            }
        }, 60000);

        if (queue.textChannel) {
            queue.textChannel.send('🎵 انتهت قائمة الأغاني!');
        }
        return;
    }

    try {
        console.log('🎵 جاري تحميل:', song.title);

        // 1. استخراج رابط البث المباشر باستخدام yt-dlp
        // هذا الرابط يكون مباشراً لسيرفرات جوجل
        const directUrl = await runYtDlp([
            song.url,
            '-f', 'bestaudio/best',
            '-g' // Get URL only
        ]);

        console.log('🔗 تم استخراج رابط البث المباشر');

        // 2. تشغيل الرابط المباشر باستخدام FFmpeg مع خيارات إعادة الاتصال
        // هذا يمنع توقف الأغنية في المنتصف
        const ffmpegProcess = spawn(ffmpegPath, [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', directUrl.trim(),
            '-vn',
            '-acodec', 'libopus',
            '-application', 'audio',
            '-frame_duration', '20',
            '-f', 'ogg',
            '-ac', '2',
            '-ar', '48000',
            'pipe:1'
        ]);

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.OggOpus
        });

        // معالجة أخطاء FFmpeg
        ffmpegProcess.stderr.on('data', (data) => {
            const message = data.toString();
            if (/error|failed|Invalid|Unknown/i.test(message)) {
                console.error(`FFmpeg stderr: ${message}`);
            }
        });

        ffmpegProcess.on('close', (code, signal) => {
            if (code !== 0) {
                console.error(`FFmpeg exited with code ${code} signal ${signal}`);
            }
        });

        ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg error:', err);
        });

        queue.player.play(resource);
        queue.playing = true;

        if (queue.textChannel) {
            queue.textChannel.send({
                embeds: [{
                    color: 0x9B59B6,
                    title: '🎶 يتم الآن تشغيل',
                    description: `**${song.title}**`,
                    fields: [
                        { name: '⏱️ المدة', value: song.duration, inline: true },
                        { name: '👤 طلب بواسطة', value: song.requestedBy, inline: true }
                    ],
                    thumbnail: song.thumbnail ? { url: song.thumbnail } : null,
                    footer: { text: '🎵 استمتع بالموسيقى!' }
                }]
            });
        }

    } catch (error) {
        console.error('❌ Error playing song:', error.stderr || error.message);

        if (queue.textChannel) {
            queue.textChannel.send(`❌ حدث خطأ أثناء تشغيل الأغنية:\n${getFriendlyYtDlpError(error)}`);
        }

        queue.songs.shift();
        if (queue.songs.length > 0) {
            playSong(guildId, queue.songs[0]);
        }
    }
}

/**
 * أمر التشغيل
 */
async function playCommand(message, args) {
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
        return message.reply('❌ يجب أن تكون في قناة صوتية أولاً!');
    }

    if (!fs.existsSync(ytDlpPath)) {
        return message.reply('❌ ملف yt-dlp غير موجود. شغّل الأمر `npm run setup` مرة واحدة ثم جرّب تشغيل الأغاني من جديد.');
    }

    if (!args.length) {
        return message.reply('❌ أرسل رابط يوتيوب بعد الأمر.\nمثال: `!شغل https://www.youtube.com/watch?v=VIDEO_ID`');
    }

    const requestedInput = args.join(' ').trim();
    const youtubeUrl = extractUrl(requestedInput);

    if (!youtubeUrl || !isYouTubeUrl(youtubeUrl)) {
        return message.reply('❌ هذا الأمر يقبل روابط YouTube فقط.\nمثال: `!شغل https://youtu.be/VIDEO_ID`');
    }

    const guildId = message.guild.id;

    try {
        message.channel.send('🔍 جاري تجهيز رابط يوتيوب...');

        let songInfo;
        let metadata;

        const query = youtubeUrl;

        console.log(`🔍 تشغيل yt-dlp للبحث عن: ${query}`);

        metadata = await runYtDlp([
            query,
            '--dump-json',
            '--no-playlist',
            '--flat-playlist'
        ]);

        const info = parseYtDlpJson(metadata);
        const videoData = info.entries ? info.entries[0] : info;

        if (!videoData) {
            return message.reply('❌ لم يتم العثور على نتائج!');
        }

        const formatDuration = (seconds) => {
            if (!seconds) return 'مباشر';
            const date = new Date(seconds * 1000);
            const hh = date.getUTCHours();
            const mm = date.getUTCMinutes();
            const ss = date.getUTCSeconds().toString().padStart(2, '0');
            if (hh) {
                return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
            }
            return `${mm}:${ss}`;
        };

        songInfo = {
            title: videoData.title,
            url: videoData.webpage_url || videoData.url,
            duration: formatDuration(videoData.duration),
            thumbnail: videoData.thumbnail,
            requestedBy: message.author.tag
        };

        console.log('✅ تم العثور على:', songInfo.title);

        const queue = getQueue(guildId);
        queue.songs.push(songInfo);
        queue.textChannel = message.channel;

        if (!queue.connection) {
            console.log('🔊 جاري الاتصال بالقناة الصوتية...');

            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            queue.player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Play
                }
            });

            queue.connection.subscribe(queue.player);

            queue.player.on(AudioPlayerStatus.Idle, () => {
                console.log('⏸️ انتهى تشغيل الأغنية');
                queue.songs.shift();
                if (queue.songs.length > 0) {
                    playSong(guildId, queue.songs[0]);
                }
            });

            queue.player.on('error', error => {
                console.error('❌ Player error:', error.message);
                queue.songs.shift();
                if (queue.songs.length > 0) {
                    playSong(guildId, queue.songs[0]);
                }
            });

            queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    if (queue.connection) queue.connection.destroy();
                    queue.connection = null;
                    queue.songs = [];
                    queue.playing = false;
                }
            });
        }

        if (queue.songs.length === 1 && !queue.playing) {
            playSong(guildId, queue.songs[0]);
        } else {
            message.channel.send({
                embeds: [{
                    color: 0x2ECC71,
                    title: '✅ تمت الإضافة إلى القائمة',
                    description: `**${songInfo.title}**`,
                    fields: [
                        { name: '📍 الموقع في القائمة', value: `#${queue.songs.length}`, inline: true }
                    ]
                }]
            });
        }

    } catch (error) {
        console.error('❌ Play command error:', error.stderr || error.message);
        message.reply(`❌ حدث خطأ:\n${getFriendlyYtDlpError(error)}`);
    }
}

/**
 * أمر التخطي
 */
function skipCommand(message) {
    const queue = getQueue(message.guild.id);
    if (!queue.player || !queue.playing) return message.reply('❌ لا توجد أغنية قيد التشغيل!');
    queue.player.stop();
    message.channel.send('⏭️ تم تخطي الأغنية!');
}

/**
 * أمر الإيقاف
 */
function stopCommand(message) {
    const queue = getQueue(message.guild.id);
    queue.songs = [];
    queue.playing = false;
    if (queue.player) queue.player.stop();
    if (queue.connection) {
        queue.connection.destroy();
        queue.connection = null;
    }
    message.channel.send('⏹️ تم إيقاف الموسيقى ومغادرة القناة!');
}

/**
 * أمر الإيقاف المؤقت
 */
function pauseCommand(message) {
    const queue = getQueue(message.guild.id);
    if (!queue.playing) return message.reply('❌ لا توجد أغنية قيد التشغيل!');
    queue.player.pause();
    message.channel.send('⏸️ تم إيقاف الأغنية مؤقتاً!');
}

/**
 * أمر الاستئناف
 */
function resumeCommand(message) {
    const queue = getQueue(message.guild.id);
    if (!queue.player) return message.reply('❌ لا توجد أغنية للاستئناف!');
    queue.player.unpause();
    message.channel.send('▶️ تم استئناف التشغيل!');
}

/**
 * أمر عرض القائمة
 */
function queueCommand(message) {
    const queue = getQueue(message.guild.id);
    if (!queue.songs.length) return message.reply('📋 قائمة الأغاني فارغة!');

    const songList = queue.songs.slice(0, 10).map((song, index) => {
        const status = index === 0 ? '🎵' : `#${index + 1}`;
        return `${status} - **${song.title}**`;
    }).join('\n');

    message.channel.send({
        embeds: [{
            color: 0x3498DB,
            title: '📋 قائمة الأغاني',
            description: songList + (queue.songs.length > 10 ? `\n...و ${queue.songs.length - 10} أغنية أخرى` : ''),
            footer: { text: `إجمالي الأغاني: ${queue.songs.length}` }
        }]
    });
}

/**
 * أمر الانضمام
 */
function joinCommand(message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('❌ يجب أن تكون في قناة صوتية!');
    const queue = getQueue(message.guild.id);
    queue.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
    });
    queue.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    queue.connection.subscribe(queue.player);
    message.channel.send(`🎤 تم الانضمام إلى **${voiceChannel.name}**!`);
}

/**
 * أمر المغادرة
 */
function leaveCommand(message) {
    const queue = getQueue(message.guild.id);
    if (queue.connection) {
        queue.connection.destroy();
        queue.connection = null;
        queue.songs = [];
        queue.playing = false;
        message.channel.send('👋 تمت المغادرة!');
    } else {
        message.reply('❌ البوت ليس في أي قناة صوتية!');
    }
}

module.exports = {
    playCommand,
    skipCommand,
    stopCommand,
    pauseCommand,
    resumeCommand,
    queueCommand,
    joinCommand,
    leaveCommand
};
