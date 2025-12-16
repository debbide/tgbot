const { Telegraf } = require('telegraf');
const { config } = require('./config');

// 创建 Bot 实例，支持 API 反代
const botOptions = {
    handlerTimeout: 90000,
};

if (config.apiBase) {
    botOptions.telegram = {
        apiRoot: config.apiBase,
        agent: null,
        webhookReply: false,
    };
}

const bot = new Telegraf(config.botToken, botOptions);

// 错误处理 - 不让错误导致程序崩溃
bot.catch((err, ctx) => {
    // 静默处理错误
});

// 中间件 - 错误捕获
bot.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        try {
            await ctx.reply('⚠️ 处理请求时出错，请稍后重试');
        } catch (e) { }
    }
});

module.exports = { bot };
