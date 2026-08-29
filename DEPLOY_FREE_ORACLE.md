# استضافة مجانية خارجية على Oracle Cloud

أفضل خيار مجاني فعلياً لبوت ديسكورد يظل Online هو Oracle Cloud Always Free.

## 1. جهز سيرفر Ubuntu مجاني

1. افتح: https://www.oracle.com/cloud/free/
2. أنشئ حساب.
3. من لوحة Oracle أنشئ VM مجاني Ubuntu من نوع Always Free.
4. ادخل على السيرفر عبر SSH.

## 2. ثبت المتطلبات على Ubuntu

```bash
sudo apt update
sudo apt install -y git curl ffmpeg fonts-dejavu-core
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. انزل مشروع البوت

```bash
git clone https://github.com/Mwotayyem/discord-music-bot.git
cd discord-music-bot
git checkout Mwotayyem-patch-1
npm install
npm run setup
```

## 4. أنشئ ملف البيئة

```bash
cp .env.example .env
nano .env
```

ضع التوكن الحقيقي داخل:

```env
DISCORD_TOKEN=ضع_توكن_البوت_الحقيقي_هنا
PREFIX=!
YTDLP_JS_RUNTIME=node
YTDLP_EXTRACTOR_ARGS=youtube:player_client=android
```

احفظ في nano:

```text
Ctrl + O
Enter
Ctrl + X
```

## 5. شغل البوت 24/7

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

بعد أمر `pm2 startup` سيظهر لك أمر طويل يبدأ بـ `sudo env ...`.
انسخه وشغله كما هو.

## أوامر مفيدة

```bash
pm2 status
pm2 logs discord-music-bot
pm2 restart discord-music-bot
pm2 stop discord-music-bot
```

## ملاحظات مهمة

- لا ترفع ملف `.env` على GitHub.
- إذا YouTube طلب تحقق، قد تحتاج cookies من المتصفح، لكن جرّب أولاً بدونها.
- البوت سيظل Online طالما سيرفر Oracle يعمل.
