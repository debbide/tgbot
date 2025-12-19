const cron = require('node-cron');
const { reminderDb, rssDb, keywordDb } = require('../db');
const { parseRssFeed, getRssInterval } = require('../commands/rss');
const { getSettings } = require('../settings');

let tasks = [];
let botInstance = null;

// RSS 并行度限制
const RSS_CONCURRENCY = 3;
const RSS_TIMEOUT = 15000; // 15秒超时

function initScheduler(bot) {
    botInstance = bot;

    // 清理旧任务
    stopScheduler();

    // 启动新任务
    const reminderTask = cron.schedule('* * * * *', checkReminders);
    tasks.push(reminderTask);

    const rssInterval = getRssInterval();
    // 确保 interval 有效
    const safeInterval = (rssInterval && rssInterval > 0) ? rssInterval : 30;
    const rssTask = cron.schedule(`*/${safeInterval} * * * *`, checkRssUpdates);
    tasks.push(rssTask);

    console.log(`⏰ 调度器已启动 (RSS间隔: ${safeInterval}分)`);
}

function stopScheduler() {
    tasks.forEach(task => task.stop());
    tasks = [];
}

async function checkReminders() {
    if (!botInstance) return;
    const pending = reminderDb.getPending();

    for (const reminder of pending) {
        try {
            await botInstance.telegram.sendMessage(
                reminder.chat_id,
                `⏰ *提醒时间到！*\n\n📝 ${reminder.message}`,
                { parse_mode: 'Markdown' }
            );
            reminderDb.markSent(reminder.id);
        } catch (error) {
            console.error(`❌ 发送提醒失败 [${reminder.id}]:`, error.message);
        }
    }
}

function matchKeywords(title, content = '') {
    // 从数据库获取关键词
    const dbKeywords = keywordDb.getKeywords();
    const dbExcludes = keywordDb.getExcludes();
    const settings = getSettings();

    // 合并配置文件和数据库的关键词
    const keywords = [...(settings.rss.keywords || []), ...dbKeywords];
    const exclude = [...(settings.rss.exclude || []), ...dbExcludes];

    const textToCheck = (title + ' ' + content).toLowerCase();

    // 排除关键词检查
    if (exclude.length > 0) {
        for (const word of exclude) {
            if (textToCheck.includes(word.toLowerCase())) {
                return false;
            }
        }
    }

    // 白名单关键词检查（为空则不筛选）
    if (keywords.length === 0) {
        return true;
    }

    for (const word of keywords) {
        if (textToCheck.includes(word.toLowerCase())) {
            return true;
        }
    }

    return false;
}

async function checkRssUpdates() {
    if (!botInstance) return;
    const feeds = rssDb.getAll();
    console.log(`📡 开始检查 RSS 更新，共 ${feeds.length} 个订阅`);

    // 使用并行度限制处理 RSS
    for (let i = 0; i < feeds.length; i += RSS_CONCURRENCY) {
        const batch = feeds.slice(i, i + RSS_CONCURRENCY);
        await Promise.all(batch.map(feed => processFeed(feed)));
    }
}

async function processFeed(feed) {
    try {
        const result = await parseRssFeed(feed.url);

        if (!result.success) {
            console.error(`❌ RSS 解析失败 [${feed.title}]: ${result.error}`);
            return;
        }

        if (result.items.length === 0) {
            console.log(`📭 RSS 无内容 [${feed.title}]`);
            return;
        }

        // 寻找上次更新的位置
        let newItems = [];
        if (!feed.last_item_id) {
            // 如果是首次运行，只取最新的一条，避免刷屏
            console.log(`🆕 首次检查 [${feed.title}]，标记最新条目`);
            newItems = [result.items[0]];
        } else {
            // 寻找 last_item_id 在当前列表中的位置
            const lastIndex = result.items.findIndex(item => item.guid === feed.last_item_id);

            if (lastIndex === -1) {
                console.log(`⚠️ 未找到上次 ID [${feed.title}]，获取最新 3 条`);
                newItems = result.items.slice(0, 3);
            } else if (lastIndex > 0) {
                newItems = result.items.slice(0, lastIndex);
                console.log(`📦 发现 ${newItems.length} 条新内容 [${feed.title}]`);
            } else {
                return;
            }
        }

        // 从旧到新推送
        newItems.reverse();

        for (const item of newItems) {
            const isMatch = matchKeywords(item.title, item.content);

            if (isMatch) {
                console.log(`📤 推送更新 [${feed.title}]: ${item.title}`);
                try {
                    await botInstance.telegram.sendMessage(
                        feed.chat_id,
                        `📰 *${feed.title || result.title}*\n\n` +
                        `📄 ${item.title}\n` +
                        `🔗 ${item.link}`,
                        { parse_mode: 'Markdown', disable_web_page_preview: false }
                    );
                } catch (sendError) {
                    console.error(`❌ 发送 RSS 消息失败 [${feed.title}]:`, sendError.message);
                }
            } else {
                console.log(`🗑️ 关键词过滤 [${feed.title}]: ${item.title}`);
            }

            rssDb.updateLastItem(feed.id, item.guid);
        }

        // 确保最后更新为最新的那条
        if (newItems.length > 0) {
            rssDb.updateLastItem(feed.id, result.items[0].guid);
        }

    } catch (error) {
        console.error(`❌ 处理 RSS 失败 [${feed.url}]:`, error.message);
    }
}

module.exports = { initScheduler, stopScheduler };
