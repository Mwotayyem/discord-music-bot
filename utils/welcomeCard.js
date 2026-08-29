const https = require('https');
const { PassThrough, Readable } = require('stream');
const PImage = require('pureimage');

const CARD_WIDTH = 900;
const CARD_HEIGHT = 300;
const FONT_NAME = 'WelcomeFont';
const DEFAULT_FONT_PATH = process.env.WELCOME_FONT_PATH || getDefaultFontPath();
let fontReady;

function loadFont() {
    if (!fontReady) {
        fontReady = PImage.registerFont(DEFAULT_FONT_PATH, FONT_NAME).load();
    }

    return fontReady;
}

async function createWelcomeCard(member, options = {}) {
    await loadFont();

    const canvas = PImage.make(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const memberNumber = member.guild.memberCount || 1;
    const displayName = normalizeName(member.displayName || member.user.username);
    const cardText = {
        eyebrow: options.eyebrow || 'WELCOME',
        title: options.title || displayName,
        subtitle: options.subtitle || 'to the server',
        detail: options.detail || `You are member #${memberNumber}`
    };

    drawBackground(ctx);
    drawFrame(ctx);
    await drawAvatar(ctx, member);
    drawCopy(ctx, cardText);

    return encodePng(canvas);
}

function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#151821');
    gradient.addColorStop(0.38, '#2a2250');
    gradient.addColorStop(0.72, '#9b4fd8');
    gradient.addColorStop(1, '#f4b6dc');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(745, 32, 185, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.10;
    ctx.beginPath();
    ctx.arc(190, 282, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
}

function drawFrame(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundedRect(ctx, 24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48, 26);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    roundedRect(ctx, 34, 34, CARD_WIDTH - 68, CARD_HEIGHT - 68, 18);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    roundedRect(ctx, 50, 50, CARD_WIDTH - 100, CARD_HEIGHT - 100, 12);
    ctx.stroke();
}

async function drawAvatar(ctx, member) {
    const size = 142;
    const x = 94;
    const y = 79;
    const center = x + size / 2;
    const middle = y + size / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(center + 7, middle + 9, size / 2 + 8, 0, Math.PI * 2);
    ctx.fill();

    const ringGradient = ctx.createLinearGradient(x, y, x + size, y + size);
    ringGradient.addColorStop(0, '#ffffff');
    ringGradient.addColorStop(0.55, '#f7d6ff');
    ringGradient.addColorStop(1, '#66f0ff');

    ctx.fillStyle = ringGradient;
    ctx.beginPath();
    ctx.arc(center, middle, size / 2 + 8, 0, Math.PI * 2);
    ctx.fill();

    try {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await fetchImage(avatarUrl);

        ctx.save();
        ctx.beginPath();
        ctx.arc(center, middle, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, 0, 0, avatar.width, avatar.height, x, y, size, size);
        ctx.restore();
    } catch (error) {
        drawFallbackAvatar(ctx, member, center, middle, size / 2);
    }
}

function drawFallbackAvatar(ctx, member, center, middle, radius) {
    const name = normalizeName(member.displayName || member.user.username);
    const initial = name.charAt(0).toUpperCase() || '?';
    const gradient = ctx.createLinearGradient(center - radius, middle - radius, center + radius, middle + radius);
    gradient.addColorStop(0, '#20263a');
    gradient.addColorStop(0.55, '#6d4aff');
    gradient.addColorStop(1, '#18d5ff');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, middle, radius, 0, Math.PI * 2);
    ctx.fill();

    drawOutlinedText(ctx, initial, center, middle + 28, 62, '#ffffff', '#151821', 'center');
}

function drawCopy(ctx, cardText) {
    const eyebrowText = fitText(ctx, cardText.eyebrow, 330, 30);
    const titleText = fitText(ctx, cardText.title, 430, 44);
    const subtitleText = fitText(ctx, cardText.subtitle, 440, 28);
    const detailText = fitText(ctx, cardText.detail, 430, 27);

    drawOutlinedText(ctx, eyebrowText, 465, 96, 30, '#ffffff', '#171923', 'center');
    drawOutlinedText(ctx, titleText, 465, 144, getNameFontSize(ctx, titleText), '#ffffff', '#171923', 'center');
    drawOutlinedText(ctx, subtitleText, 465, 181, 25, '#f7f2ff', '#171923', 'center');
    drawOutlinedText(ctx, detailText, 465, 218, 27, '#ffffff', '#171923', 'center');

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillRect(315, 238, 300, 2);
}

function drawOutlinedText(ctx, text, x, y, size, fill, stroke, align = 'left') {
    ctx.font = `${size}pt ${FONT_NAME}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = stroke;

    const offsets = [
        [-3, -3], [0, -3], [3, -3],
        [-3, 0], [3, 0],
        [-3, 3], [0, 3], [3, 3]
    ];

    offsets.forEach(([dx, dy]) => ctx.fillText(text, x + dx, y + dy));

    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

function getNameFontSize(ctx, text) {
    const maxWidth = 430;

    for (let size = 44; size >= 25; size -= 1) {
        ctx.font = `${size}pt ${FONT_NAME}`;
        if (ctx.measureText(text).width <= maxWidth) return size;
    }

    return 25;
}

function fitText(ctx, text, maxWidth, size) {
    const cleanText = normalizeName(text);
    ctx.font = `${size}pt ${FONT_NAME}`;

    if (ctx.measureText(cleanText).width <= maxWidth) return cleanText;

    let clipped = cleanText;
    while (clipped.length > 3 && ctx.measureText(`${clipped}...`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }

    return `${clipped}...`;
}

function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function fetchImage(url) {
    const buffer = await fetchBuffer(url);
    const stream = Readable.from(buffer);

    try {
        return await PImage.decodePNGFromStream(stream);
    } catch (error) {
        return PImage.decodeJPEGFromStream(Readable.from(buffer));
    }
}

function fetchBuffer(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();

                if (!response.headers.location || redirectsLeft <= 0) {
                    reject(new Error('Avatar redirect failed.'));
                    return;
                }

                const nextUrl = new URL(response.headers.location, url).toString();
                resolve(fetchBuffer(nextUrl, redirectsLeft - 1));
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Avatar download failed with status ${response.statusCode}.`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

function encodePng(canvas) {
    return new Promise((resolve, reject) => {
        const stream = new PassThrough();
        const chunks = [];

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);

        PImage.encodePNGToStream(canvas, stream).catch(reject);
    });
}

function normalizeName(name) {
    return String(name)
        .replace(/[`*_~|\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 42) || 'New Member';
}

module.exports = {
    createWelcomeCard
};

function getDefaultFontPath() {
    if (process.platform === 'win32') {
        return 'C:\\Windows\\Fonts\\arial.ttf';
    }

    return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
}
