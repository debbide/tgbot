const { rssDb, settingsDb, keywordDb } = require('../db');
const { getSettings } = require('../settings');
const { fetchWithPuppeteer } = require('../services/puppeteer.service');

const Parser = require('rss-parser');
const parser = new Parser({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    }
});

/**
 * 解析 RSS Feed
 * 先尝试普通请求，如果返回 403 则使用 Puppeteer 获取
 */
async function parseRssFeed(url) {
    try {
        const feed = await parser.parseURL(url);
        return formatFeedResult(feed);
    } catch (error) {
        // 如果是 403 错误，尝试使用 Puppeteer
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
            console.log(`🔄 RSS 普通请求被拒绝 (403)，尝试使用 Puppeteer: ${url}`);
            return await parseRssFeedWithPuppeteer(url);
        }
        return { success: false, error: error.message };
    }
}

/**
 * 使用 Puppeteer 获取并解析 RSS Feed
 */
async function parseRssFeedWithPuppeteer(url) {
    try {
        const result = await fetchWithPuppeteer(url);
        if (!result.success) {
            return { success: false, error: result.error };
        }

        // 从 HTML 中提取 XML 内容
        let xmlContent = result.content;

        // 如果页面被包装在 HTML 中，尝试提取 RSS/XML
        if (xmlContent.includes('<pre>')) {
            // Chromium 会把 XML 包装在 <pre> 标签中
            const match = xmlContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
            if (match) {
                xmlContent = match[1]
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"');
            }
        }

        // 解析 XML 字符串
        const feed = await parser.parseString(xmlContent);
        return formatFeedResult(feed);
    } catch (error) {
        return { success: false, error: `Puppeteer 解析失败: ${error.message}` };
    }
}

/**
 * 格式化 Feed 结果
 */
function formatFeedResult(feed) {
    return {
        success: true,
        title: feed.title,
        items: feed.items.map(item => ({
            title: item.title,
            link: item.link,
            guid: item.guid || item.link || item.title,
            content: item.contentSnippet || item.content || ''
        }))
    };
}

function getRssInterval() {
    const saved = settingsDb.get('rss_interval');
    const settings = getSettings();
    return saved ? parseInt(saved) : (settings.rss.checkInterval || 30);
}

function setRssInterval(minutes) {
    settingsDb.set('rss_interval', minutes);
}

function setupRssCommand(bot) {
    bot.command('rss', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const action = args[0];

        if (!action) {
            const interval = getRssInterval();
            const keywords = keywordDb.getKeywords();
            const excludes = keywordDb.getExcludes();
            return ctx.reply(
                '📰 <b>RSS 订阅管理</b>\n\n' +
                '<code>/rss add URL</code> - 添加订阅\n' +
                '<code>/rss list</code> - 查看订阅\n' +
                '<code>/rss del ID</code> - 删除订阅\n' +
                `<code>/rss interval 分钟</code> - 检查间隔 (${interval}分钟)\n\n` +
                '<b>关键词筛选:</b>\n' +
                '<code>/rss kw add 词1,词2</code> - 添加关键词\n' +
                '<code>/rss kw del 词1,词2</code> - 删除关键词\n' +
                '<code>/rss kw list</code> - 查看关键词\n' +
                '<code>/rss ex add 词1,词2</code> - 添加排除词\n' +
                '<code>/rss ex del 词1,词2</code> - 删除排除词\n\n' +
                `📌 关键词: ${keywords.length ? keywords.join(', ') : '无'}\n` +
                `🚫 排除词: ${excludes.length ? excludes.join(', ') : '无'}`,
                { parse_mode: 'HTML' }
            );
        }

        switch (action) {
            case 'add': {
                const url = args[1];
                if (!url) return ctx.reply('❌ 用法: /rss add <URL>');
                const loading = await ctx.reply('🔄 正在解析 RSS...');
                const result = await parseRssFeed(url);
                if (result.success) {
                    rssDb.add(ctx.from.id.toString(), ctx.chat.id.toString(), url, result.title);
                    await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
                        `✅ 订阅成功\n\n📰 ${result.title}\n🔗 ${url}`);
                } else {
                    await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
                        `❌ 解析失败: ${result.error}`);
                }
                break;
            }

            case 'list': {
                const feeds = rssDb.list(ctx.from.id.toString());
                if (feeds.length === 0) return ctx.reply('📭 暂无订阅');
                const list = feeds.map((f) => `🔖 #${f.id} | ${f.title || '未知'}\n   ${f.url}`).join('\n\n');
                ctx.reply(`📰 *RSS 订阅列表*\n\n${list}`, { parse_mode: 'Markdown' });
                break;
            }

            case 'del': {
                const id = parseInt(args[1]);
                if (!id) return ctx.reply('❌ 用法: /rss del <ID>');
                const result = rssDb.delete(id, ctx.from.id.toString());
                ctx.reply(result.changes > 0 ? `✅ 订阅 #${id} 已删除` : `❌ 未找到订阅 #${id}`);
                break;
            }

            case 'interval': {
                const minutes = parseInt(args[1]);
                if (!minutes || minutes < 1 || minutes > 1440) {
                    return ctx.reply('❌ 用法: /rss interval <分钟>\n范围: 1-1440');
                }
                setRssInterval(minutes);
                ctx.reply(`✅ 检查间隔已设为 ${minutes} 分钟\n⚠️ 重启后生效`);
                break;
            }

            case 'kw': {
                const subAction = args[1];
                const input = args.slice(2).join(' ');

                if (subAction === 'add' && input) {
                    const words = input.split(',').map(w => w.trim()).filter(w => w);
                    const added = [];
                    for (const word of words) {
                        const result = keywordDb.add(word, 'include');
                        if (result.changes > 0) added.push(word);
                    }
                    ctx.reply(added.length > 0 ? `✅ 已添加关键词: ${added.join(', ')}` : '⚠️ 关键词已存在');
                } else if (subAction === 'del' && input) {
                    const words = input.split(',').map(w => w.trim()).filter(w => w);
                    const deleted = [];
                    for (const word of words) {
                        const result = keywordDb.delete(word, 'include');
                        if (result.changes > 0) deleted.push(word);
                    }
                    ctx.reply(deleted.length > 0 ? `✅ 已删除关键词: ${deleted.join(', ')}` : '❌ 未找到关键词');
                } else if (subAction === 'list') {
                    const keywords = keywordDb.getKeywords();
                    ctx.reply(`📌 *关键词列表*\n\n${keywords.length ? keywords.join('\n') : '无'}`, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply('❌ 用法:\n/rss kw add 词1,词2\n/rss kw del 词1,词2\n/rss kw list');
                }
                break;
            }

            case 'ex': {
                const subAction = args[1];
                const input = args.slice(2).join(' ');

                if (subAction === 'add' && input) {
                    const words = input.split(',').map(w => w.trim()).filter(w => w);
                    const added = [];
                    for (const word of words) {
                        const result = keywordDb.add(word, 'exclude');
                        if (result.changes > 0) added.push(word);
                    }
                    ctx.reply(added.length > 0 ? `✅ 已添加排除词: ${added.join(', ')}` : '⚠️ 排除词已存在');
                } else if (subAction === 'del' && input) {
                    const words = input.split(',').map(w => w.trim()).filter(w => w);
                    const deleted = [];
                    for (const word of words) {
                        const result = keywordDb.delete(word, 'exclude');
                        if (result.changes > 0) deleted.push(word);
                    }
                    ctx.reply(deleted.length > 0 ? `✅ 已删除排除词: ${deleted.join(', ')}` : '❌ 未找到排除词');
                } else if (subAction === 'list') {
                    const excludes = keywordDb.getExcludes();
                    ctx.reply(`🚫 *排除词列表*\n\n${excludes.length ? excludes.join('\n') : '无'}`, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply('❌ 用法:\n/rss ex add 词1,词2\n/rss ex del 词1,词2\n/rss ex list');
                }
                break;
            }

            default:
                ctx.reply('❌ 未知操作');
        }
    });
}

module.exports = { setupRssCommand, parseRssFeed, getRssInterval };
