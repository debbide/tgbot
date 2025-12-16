/**
 * ================================
 * 🔧 机器人配置文件（模板）
 * ================================
 * 复制此文件为 config.js 后使用
 */

module.exports = {
    // ==================== Bot 配置 ====================

    // Telegram Bot Token (从 @BotFather 获取)
    BOT_TOKEN: 'your_bot_token_here',

    // 管理员用户 ID (可选)
    ADMIN_ID: '',

    // Telegram API 反代地址 (可选，留空使用官方 API)
    // 例如: 'https://your-proxy.com/bot'
    TG_API_BASE: '',

    // ==================== 邮件配置 (可选) ====================

    MAIL: {
        HOST: 'imap.gmail.com',
        PORT: 993,
        USER: '',
        PASS: '',
        DIGEST_TIME: '08:00',
    },

    // ==================== 数据库配置 ====================

    DB_PATH: './data/bot.db',

    // ==================== OpenAI 兼容 API 配置 ====================

    OPENAI: {
        // API 地址 (支持 one-api、new-api 等中转服务)
        API_BASE: 'https://api.openai.com/v1',
        // API 密钥
        API_KEY: '',
        // 模型名称
        MODEL: 'gpt-3.5-turbo',
    },

    // ==================== RSS 配置 ====================

    RSS: {
        // 检查间隔（分钟）
        CHECK_INTERVAL: 30,

        // 全局关键词白名单（标题包含任一关键词才推送，留空不筛选）
        KEYWORDS: [],
        // 例如: KEYWORDS: ['AI', '科技', 'Github'],

        // 全局排除关键词（标题包含则不推送）
        EXCLUDE: [],
        // 例如: EXCLUDE: ['广告', '招聘'],
    },

    // ==================== 功能开关 ====================

    FEATURES: {
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
    },
};
