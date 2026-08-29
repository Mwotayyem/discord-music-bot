const fs = require('fs');
const https = require('https');
const path = require('path');

const isWindows = process.platform === 'win32';
const fileName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const targetPath = path.join(process.cwd(), fileName);
const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;

function downloadFile(url, destination, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'discord-music-bot-setup'
            }
        }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();

                if (!response.headers.location || redirectsLeft <= 0) {
                    reject(new Error('تعذر متابعة رابط تحميل yt-dlp.'));
                    return;
                }

                const nextUrl = new URL(response.headers.location, url).toString();
                resolve(downloadFile(nextUrl, destination, redirectsLeft - 1));
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`فشل التحميل. كود الاستجابة: ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(destination);
            response.pipe(file);

            file.on('finish', () => {
                file.close(resolve);
            });

            file.on('error', (error) => {
                fs.unlink(destination, () => reject(error));
            });
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.destroy(new Error('انتهت مهلة تحميل yt-dlp.'));
        });
    });
}

async function setup() {
    if (fs.existsSync(targetPath)) {
        console.log(`✅ ${fileName} موجود بالفعل.`);
        return;
    }

    console.log('⏳ جاري تحميل محرك yt-dlp (قد يستغرق وقتاً قليلاً)...');
    await downloadFile(downloadUrl, targetPath);

    if (!isWindows) {
        fs.chmodSync(targetPath, 0o755);
    }

    console.log(`✅ تم تحميل ${fileName} بنجاح!`);
}

setup().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
