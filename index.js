// TG 多功能机器人入口

const { loadSettings, getSettings } = require('./src/settings');
const { initDatabase } = require('./src/db');
const { startWebServer, setBotStatus, setRestartCallback } = require('./src/web/server');
const { Telegraf } = require('telegraf');
const { initScheduler, stopScheduler } = require('./src/services/scheduler.service');

// 导入命令模块
const { setupStartCommand, setupHelpCommand } = require('./src/commands/start');
const { setupTranslateCommand } = require('./src/commands/translate');
const { setupQRCodeCommand } = require('./src/commands/qrcode');
const { setupShortenCommand } = require('./src/commands/shorten');
const { setupRemindCommand } = require('./src/commands/remind');
const { setupNoteCommand } = require('./src/commands/note');
const { setupWeatherCommand } = require('./src/commands/weather');
const { setupRateCommand } = require('./src/commands/rate');
const { setupIdCommand } = require('./src/commands/id');
const { setupChatCommand } = require('./src/commands/chat');
const { setupNetworkCommand } = require('./src/commands/network');
const { setupSummaryCommand } = require('./src/commands/summary');
const { setupRssCommand } = require('./src/commands/rss');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let currentBot = null;

async function startBot() {
    // 如果已有实例，先停止
    if (currentBot) {
        try {
            stopScheduler(); // 停止调度任务
            await currentBot.stop();
            console.log('🛑 旧 Bot 实例已停止');
        } catch (e) {
            console.error('停止旧实例失败:', e.message);
        }
        currentBot = null;
        setBotStatus(false);
    }

    // 加载最新配置
    const settings = loadSettings();

    if (!settings.botToken) {
        console.error('❌ 请配置 BOT_TOKEN');
        return;
    }

    // 创建 Bot 实例
    const botOptions = {};
    if (settings.tgApiBase) {
        botOptions.telegram = { apiRoot: settings.tgApiBase };
    }
    const bot = new Telegraf(settings.botToken, botOptions);

    // 注册命令
    setupStartCommand(bot);
    setupHelpCommand(bot);
    setupTranslateCommand(bot);
    setupQRCodeCommand(bot);
    setupShortenCommand(bot);
    setupRemindCommand(bot);
    setupNoteCommand(bot);
    setupWeatherCommand(bot);
    setupRateCommand(bot);
    setupIdCommand(bot);
    setupChatCommand(bot);
    setupNetworkCommand(bot);
    setupSummaryCommand(bot);
    setupRssCommand(bot);

    currentBot = bot;

    // 启动
    try {
        await bot.launch();
        console.log('✅ Bot 已启动');

        // 启动调度器
        initScheduler(bot);

        setBotStatus(true);
    } catch (err) {
        console.error('❌ Bot 启动失败:', err.message);
        setBotStatus(false);
        throw err;
    }
}

async function main() {
    // 初始化数据库
    initDatabase();

    // 设置重启回调
    setRestartCallback(async () => {
        await startBot();
    });

    // 启动 Web 面板
    await startWebServer(3000);

    // 尝试启动 Bot
    try {
        await startBot();
    } catch (err) {
        console.error('初始启动失败，请检查配置');
    }

    // 优雅退出
    const stopSignals = ['SIGINT', 'SIGTERM'];
    stopSignals.forEach(signal => {
        process.once(signal, () => {
            stopScheduler();
            if (currentBot) {
                currentBot.stop(signal);
            }
            process.exit(0);
        });
    });
}

main().catch((err) => {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
});
