const { rssDb, settingsDb, keywordDb } = require('../db');
const { config } = require('../config');

async function parseRssFeed(url) {
    try {
        const response = await fetch(url);
        const xml = await response.text();
        const titleMatch = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : 'Unknown Feed';
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
            const itemXml = match[1];
            const itemTitleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
            const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
            const guidMatch = itemXml.match(/<guid.*?>(.*?)<\/guid>/);
            items.push({
                title: itemTitleMatch ? (itemTitleMatch[1] || itemTitleMatch[2]) : 'No Title',
                link: linkMatch ? linkMatch[1].trim() : '',
                guid: guidMatch ? guidMatch[1] : (linkMatch ? linkMatch[1].trim() : ''),
            });
        }
        return { success: true, title, items };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function getRssInterval() {
    const saved = settingsDb.get('rss_interval');
    return saved ? parseInt(saved) : (config.rss.checkInterval || 30);
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
