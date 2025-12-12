const YTDlpWrap = require('yt-dlp-wrap').default;

async function download() {
    console.log('⏳ جاري تحميل محرك yt-dlp (قد يستغرق وقتاً قليلاً)...');
    await YTDlpWrap.downloadFromGithub();
    console.log('✅ تم تحميل المحرك بنجاح!');
}

download();
