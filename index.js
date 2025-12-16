// TG 多功能机器人入口

// 初始化日志系统 (必须在其他模块之前)
const { setupLogger } = require('./src/logger');
setupLogger();

const fs = require('fs');
const path = require('path');
const { loadSettings } = require('./src/settings');

// 重启标记文件路径
const RESTART_FLAG_FILE = path.join(__dirname, 'data/restart_flag.json');
const { initDatabase } = require('./src/db');
const { startWebServer, setBotStatus, setRestartCallback, setGetBotInstance } = require('./src/web/server');
const { Telegraf } = require('telegraf');
const { initScheduler, stopScheduler } = require('./src/services/scheduler.service');
const { initAlert } = require('./src/services/alert.service');

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
const { setupPanelCommand } = require('./src/commands/panel');
const { setupGroupCommand } = require('./src/commands/group');
const { setupBroadcastCommand } = require('./src/commands/broadcast');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let currentBot = null;

async function startBot() {
    // 如果已有实例，先停止
    if (currentBot) {
        try {
            stopScheduler();
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

    // 管理员检查函数
    const isAdmin = (ctx) => {
        if (!settings.adminId) return false;
        return String(ctx.from?.id) === String(settings.adminId);
    };

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
    setupPanelCommand(bot, isAdmin);
    setupGroupCommand(bot, isAdmin);
    setupBroadcastCommand(bot, isAdmin);

    currentBot = bot;

    // 启动 (带重试)
    const MAX_RETRIES = 5;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`🚀 正在启动 Bot... (尝试 ${attempt}/${MAX_RETRIES})`);
            await bot.launch();
            console.log('✅ Bot 已启动');
            lastError = null;
            break;
        } catch (err) {
            lastError = err;
            console.error(`❌ 启动失败 (${attempt}/${MAX_RETRIES}):`, err.message);
            if (attempt < MAX_RETRIES) {
                const delay = attempt * 3000;
                console.log(`⏳ ${delay / 1000} 秒后重试...`);
                await sleep(delay);
            }
        }
    }

    if (lastError) {
        console.error('❌ Bot 启动失败，已达到最大重试次数');
        setBotStatus(false);
        throw lastError;
    }

    // 启动调度器
    initScheduler(bot);

    // 初始化告警服务
    console.log('📋 管理员 ID:', settings.adminId || '(未配置)');

    if (settings.adminId) {
        initAlert(bot, settings.adminId);

        // 检测是否是由 Telegram 触发的重启
        let restartInfo = null;
        if (fs.existsSync(RESTART_FLAG_FILE)) {
            try {
                restartInfo = JSON.parse(fs.readFileSync(RESTART_FLAG_FILE, 'utf-8'));
                // 删除标记文件
                fs.unlinkSync(RESTART_FLAG_FILE);
                console.log('📋 检测到重启标记，来源:', restartInfo.type);
            } catch (e) {
                console.error('⚠️ 读取重启标记失败:', e.message);
            }
        }

        // 发送重启完成通知或普通启动通知 (异步执行，不阻塞启动流程)
        (async () => {
            try {
                if (restartInfo && restartInfo.chatId) {
                    console.log('📤 正在发送重启完成通知...');
                    const restartCompleteMsg = `✅ <b>Bot 重启完成</b>\n\n⏱ 完成时间: ${new Date().toLocaleString('zh-CN')}\n📊 所有功能正常运行`;

                    if (restartInfo.type === 'edit') {
                        // 编辑原消息
                        await bot.telegram.editMessageText(
                            restartInfo.chatId,
                            restartInfo.messageId,
                            null,
                            restartCompleteMsg,
                            { parse_mode: 'HTML' }
                        );
                    } else {
                        // 回复消息
                        await bot.telegram.sendMessage(
                            restartInfo.chatId,
                            restartCompleteMsg,
                            {
                                parse_mode: 'HTML',
                                reply_to_message_id: restartInfo.messageId
                            }
                        );
                    }
                    console.log('✅ 重启完成通知已发送');
                } else {
                    console.log('📤 正在发送启动通知...');
                    await bot.telegram.sendMessage(
                        settings.adminId,
                        '✅ *Bot 已成功启动*\n\n' +
                        `⏱ 启动时间: ${new Date().toLocaleString('zh-CN')}\n` +
                        '📊 所有功能正常运行',
                        { parse_mode: 'Markdown' }
                    );
                    console.log('✅ 启动通知已发送');
                }
            } catch (e) {
                console.error('❌ 发送通知失败:', e.message);
            }
        })();
    } else {
        console.log('⚠️ 未配置管理员 ID，跳过启动通知');
    }

    console.log('📊 设置 Bot 状态为运行中...');
    setBotStatus(true);
    console.log('✅ Bot 状态已更新');
}

async function main() {
    // 初始化数据库
    initDatabase();

    // 设置重启回调
    setRestartCallback(async () => {
        await startBot();
    });

    // 注册 Bot 实例获取器
    setGetBotInstance(() => currentBot);

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
