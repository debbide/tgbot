/**
 * 配置管理模块
 * 支持从文件读取配置，运行时热更新
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

// 默认配置
const defaultSettings = {
    botToken: process.env.BOT_TOKEN || '',
    adminId: process.env.ADMIN_ID || '',
    tgApiBase: process.env.TG_API_BASE || '',
    panelPassword: process.env.PANEL_PASSWORD || '',

    openai: {
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-3.5-turbo',
    },

    mail: {
        host: 'imap.gmail.com',
        port: 993,
        user: '',
        pass: '',
        digestTime: '08:00',
    },

    rss: {
        checkInterval: 30,
        keywords: [],
        exclude: [],
    },

    features: {
        TRANSLATE: true,
        QRCODE: true,
        SHORTEN: true,
        REMIND: true,
        NOTE: true,
        RSS: true,
        WEATHER: true,
        RATE: true,
        MAIL: false,
        CHAT: true,
        NETWORK: true,
        SUMMARY: true,
    },
};

// 内存中的配置缓存
let currentSettings = null;

/**
 * 确保 data 目录存在
 */
function ensureDataDir() {
    const dataDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

/**
 * 加载配置
 */
function loadSettings() {
    ensureDataDir();

    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const saved = JSON.parse(data);
            // 合并默认配置和保存的配置
            currentSettings = deepMerge(defaultSettings, saved);
        } catch (err) {
            console.error('⚠️ 读取配置文件失败，使用默认配置:', err.message);
            currentSettings = { ...defaultSettings };
        }
    } else {
        currentSettings = { ...defaultSettings };
    }

    // 环境变量作为默认值（仅当配置中未设置时）
    if (process.env.BOT_TOKEN && !currentSettings.botToken) currentSettings.botToken = process.env.BOT_TOKEN;
    if (process.env.ADMIN_ID && !currentSettings.adminId) currentSettings.adminId = process.env.ADMIN_ID;
    if (process.env.TG_API_BASE && !currentSettings.tgApiBase) currentSettings.tgApiBase = process.env.TG_API_BASE;

    return currentSettings;
}

/**
 * 保存配置
 */
function saveSettings(newSettings) {
    ensureDataDir();
    currentSettings = deepMerge(currentSettings, newSettings);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
    return currentSettings;
}

/**
 * 获取当前配置
 */
function getSettings() {
    if (!currentSettings) {
        loadSettings();
    }
    return currentSettings;
}

/**
 * 获取脱敏后的配置（用于日志和前端显示）
 */
function getSafeSettings() {
    const settings = getSettings();
    return {
        ...settings,
        botToken: maskSecret(settings.botToken),
        panelPassword: maskSecret(settings.panelPassword),
        openai: {
            ...settings.openai,
            apiKey: maskSecret(settings.openai.apiKey),
        },
        mail: {
            ...settings.mail,
            pass: maskSecret(settings.mail.pass),
        },
    };
}

/**
 * 脱敏处理
 */
function maskSecret(value) {
    if (!value || value.length < 8) return '***';
    return value.slice(0, 4) + '****' + value.slice(-4);
}

/**
 * 深度合并对象
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

module.exports = {
    loadSettings,
    saveSettings,
    getSettings,
    getSafeSettings,
    maskSecret,
};
