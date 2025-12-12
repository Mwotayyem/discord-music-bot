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
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

// تحديد مسار yt-dlp
const ytDlpPath = path.join(process.cwd(), 'yt-dlp.exe');
const ytDlp = new YTDlpWrap(ytDlpPath);

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
        const directUrl = await ytDlp.execPromise([
            song.url,
            '-f', 'bestaudio/best',
            '-g' // Get URL only
        ]);

        console.log('🔗 تم استخراج رابط البث المباشر');

        // 2. تشغيل الرابط المباشر باستخدام FFmpeg مع خيارات إعادة الاتصال
        // هذا يمنع توقف الأغنية في المنتصف
        const ffmpegProcess = require('child_process').spawn('ffmpeg', [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', directUrl.trim(),
            '-acodec', 'libopus',
            '-f', 'opus',
            '-ac', '2',
            '-ar', '48000',
            'pipe:1'
        ]);

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        resource.volume?.setVolume(0.5);

        // معالجة أخطاء FFmpeg
        ffmpegProcess.stderr.on('data', (data) => {
            // يمكن تجاهل الرسائل العادية، فقط نعرض الأخطاء إذا توقف
            // console.log(`FFmpeg: ${data}`);
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
        console.error('❌ Error playing song:', error.message);

        if (queue.textChannel) {
            queue.textChannel.send(`❌ حدث خطأ أثناء تشغيل الأغنية: ${error.message}`);
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

    if (!args.length) {
        return message.reply('❌ الرجاء إدخال اسم الأغنية أو رابط يوتيوب!');
    }

    const searchQuery = args.join(' ');
    const guildId = message.guild.id;

    try {
        message.channel.send('🔍 جاري البحث...');

        let songInfo;
        let metadata;

        // البحث باستخدام yt-dlp
        const query = searchQuery.startsWith('http') ? searchQuery : `ytsearch1:${searchQuery}`;

        console.log(`🔍 تشغيل yt-dlp للبحث عن: ${query}`);

        metadata = await ytDlp.execPromise([
            query,
            '--dump-json',
            '--no-playlist',
            '--flat-playlist'
        ]);

        const info = JSON.parse(metadata);
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
        console.error('❌ Play command error:', error.message);
        message.reply(`❌ حدث خطأ: ${error.message}`);
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
