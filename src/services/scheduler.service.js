const cron = require('node-cron');
const { reminderDb, rssDb, keywordDb } = require('../db');
const { parseRssFeed, getRssInterval } = require('../commands/rss');
const { getSettings } = require('../settings');

let tasks = [];

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
        } catch (error) { }
    }
}

function matchKeywords(title) {
    // 从数据库获取关键词
    const dbKeywords = keywordDb.getKeywords();
    const dbExcludes = keywordDb.getExcludes();
    const settings = getSettings();

    // 合并配置文件和数据库的关键词
    const keywords = [...(settings.rss.keywords || []), ...dbKeywords];
    const exclude = [...(settings.rss.exclude || []), ...dbExcludes];

    // 排除关键词检查
    if (exclude.length > 0) {
        for (const word of exclude) {
            if (title.toLowerCase().includes(word.toLowerCase())) {
                return false;
            }
        }
    }

    // 白名单关键词检查（为空则不筛选）
    if (keywords.length === 0) {
        return true;
    }

    for (const word of keywords) {
        if (title.toLowerCase().includes(word.toLowerCase())) {
            return true;
        }
    }

    return false;
}

async function checkRssUpdates() {
    if (!botInstance) return;
    const feeds = rssDb.getAll();

    for (const feed of feeds) {
        try {
            const result = await parseRssFeed(feed.url);

            if (result.success && result.items.length > 0) {
                const latestItem = result.items[0];

                if (latestItem.guid !== feed.last_item_id) {
                    if (!matchKeywords(latestItem.title)) {
                        rssDb.updateLastItem(feed.id, latestItem.guid);
                        continue;
                    }

                    await botInstance.telegram.sendMessage(
                        feed.chat_id,
                        `📰 *${feed.title || result.title}*\n\n` +
                        `📄 ${latestItem.title}\n` +
                        `🔗 ${latestItem.link}`,
                        { parse_mode: 'Markdown', disable_web_page_preview: false }
                    );

                    rssDb.updateLastItem(feed.id, latestItem.guid);
                }
            }
        } catch (error) { }
    }
}

module.exports = { initScheduler, stopScheduler };
