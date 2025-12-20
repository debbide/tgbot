const { rssDb, settingsDb, keywordDb } = require('../db');
const { getSettings } = require('../settings');
const { fetchWithPuppeteer } = require('../services/puppeteer.service');

const Parser = require('rss-parser');
const parser = new Parser({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
});

/**
 * 解析 RSS Feed
 * 先尝试普通请求，失败后尝试手动 fetch 并清理 BOM，最后使用 Puppeteer
 */
async function parseRssFeed(url) {
    // 1. 首先尝试直接解析
    try {
        const feed = await parser.parseURL(url);
        return formatFeedResult(feed);
    } catch (error) {
        console.log(`📋 RSS 直接解析失败 [${url}]: ${error.message}`);

        // 2. 如果是 403 错误，使用 Puppeteer
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
            console.log(`🔄 尝试使用 Puppeteer: ${url}`);
            return await parseRssFeedWithPuppeteer(url);
        }

        // 3. 其他错误，尝试手动 fetch 并清理 BOM
        try {
            console.log(`🔄 尝试手动 fetch 并清理: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    console.log(`🔄 手动 fetch 返回 403，使用 Puppeteer: ${url}`);
                    return await parseRssFeedWithPuppeteer(url);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            let text = await response.text();

            // 清理 BOM 和前导空白
            text = text.replace(/^\uFEFF/, '').replace(/^\s+/, '');

            // 确保以 XML 声明或 RSS 标签开头
            if (!text.startsWith('<?xml') && !text.startsWith('<rss') && !text.startsWith('<feed')) {
                // 尝试找到 XML 的开始位置
                const xmlStart = text.indexOf('<?xml');
                const rssStart = text.indexOf('<rss');
                const feedStart = text.indexOf('<feed');
                const startPos = Math.min(
                    xmlStart >= 0 ? xmlStart : Infinity,
                    rssStart >= 0 ? rssStart : Infinity,
                    feedStart >= 0 ? feedStart : Infinity
                );
                if (startPos !== Infinity) {
                    text = text.substring(startPos);
                }
            }

            const feed = await parser.parseString(text);
            return formatFeedResult(feed);
        } catch (fetchError) {
            console.error(`❌ 手动 fetch 也失败: ${fetchError.message}`);
            return { success: false, error: error.message };
        }
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

        // 提取 XML 内容（处理多种浏览器返回格式）
        const xmlContent = extractXmlContent(result.content);

        if (!xmlContent) {
            return { success: false, error: '无法从页面中提取 XML 内容' };
        }

        console.log(`📄 提取的 XML 长度: ${xmlContent.length} 字符`);

        // 解析 XML 字符串
        const feed = await parser.parseString(xmlContent);
        return formatFeedResult(feed);
    } catch (error) {
        return { success: false, error: `Puppeteer 解析失败: ${error.message}` };
    }
}

/**
 * 从 Puppeteer 返回的内容中提取 XML
 */
function extractXmlContent(content) {
    // 调试日志：显示内容开头
    const contentStart = content.substring(0, 200).replace(/\s+/g, ' ');
    console.log(`🔍 页面内容开头: ${contentStart}...`);

    // 1. 如果内容直接以 XML 声明开头，直接返回
    if (content.trim().startsWith('<?xml')) {
        console.log('✅ 检测到纯 XML 内容');
        return content.trim();
    }

    // 2. 尝试从 <rss 或 <feed 标签开始提取（Atom/RSS）
    const rssMatch = content.match(/<rss[\s\S]*<\/rss>/i);
    if (rssMatch) {
        console.log('✅ 从内容中提取到 <rss> 标签');
        return '<?xml version="1.0" encoding="UTF-8"?>' + rssMatch[0];
    }

    const feedMatch = content.match(/<feed[\s\S]*<\/feed>/i);
    if (feedMatch) {
        console.log('✅ 从内容中提取到 <feed> 标签');
        return '<?xml version="1.0" encoding="UTF-8"?>' + feedMatch[0];
    }

    // 3. 尝试从 <pre> 标签中提取（某些浏览器格式）
    const preMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
        console.log('✅ 从 <pre> 标签中提取内容');
        let xml = preMatch[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        return xml;
    }

    // 4. 尝试提取 body 内的内容
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        const bodyContent = bodyMatch[1].trim();
        // 检查 body 内容是否包含 RSS
        if (bodyContent.includes('<rss') || bodyContent.includes('<feed')) {
            console.log('✅ 从 <body> 中提取到 RSS 内容');
            return bodyContent;
        }
    }

    // 5. 返回 null 表示无法提取
    return null;
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
        const args = ctx.message.text.split(' ').slice(1).filter(a => a.trim());
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
