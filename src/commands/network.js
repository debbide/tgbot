/**
 * 🌐 网络工具命令
 * 提供 IP 归属地查询和域名 Whois 查询
 */

const { getSettings } = require('../settings');
const whois = require('whois');
const util = require('util');

// Promisify whois lookup
const whoisLookup = util.promisify(whois.lookup);

/**
 * 查询 IP 归属地
 * 使用 ip-api.com (免费，无 key，限制 45次/分)
 */
async function lookupIp(ip) {
    const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,regionName,city,isp,org,as,query`);
    const data = await response.json();

    if (data.status !== 'success') {
        throw new Error(data.message || '查询失败');
    }

    return data;
}

/**
 * 设置网络命令
 */
function setupNetworkCommand(bot) {
    const settings = getSettings();

    // 检查功能是否启用
    if (settings.features?.NETWORK === false) {
        return;
    }

    // /ip 命令
    bot.command('ip', async (ctx) => {
        const text = ctx.message.text;
        const match = text.match(/^\/ip\s+(.+)/);

        if (!match) {
            return ctx.reply('🌐 *IP 查询*\n\n用法: `/ip <IP地址>`\n示例: `/ip 8.8.8.8`', { parse_mode: 'Markdown' });
        }

        const ip = match[1].trim();

        try {
            await ctx.sendChatAction('typing');
            const data = await lookupIp(ip);

            const message = `🌐 *IP 查询结果*\n\n` +
                `*IP:* \`${data.query}\`\n` +
                `*位置:* ${data.country} ${data.regionName} ${data.city}\n` +
                `*ISP:* ${data.isp}\n` +
                `*组织:* ${data.org}\n` +
                `*AS:* ${data.as}`;

            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (err) {
            await ctx.reply(`❌ 查询失败: ${err.message}`);
        }
    });

    // /whois 命令
    bot.command('whois', async (ctx) => {
        const text = ctx.message.text;
        const match = text.match(/^\/whois\s+(.+)/);

        if (!match) {
            return ctx.reply('🌐 *Whois 查询*\n\n用法: `/whois <域名>`\n示例: `/whois google.com`', { parse_mode: 'Markdown' });
        }

        const domain = match[1].trim();

        try {
            await ctx.sendChatAction('typing');

            // 使用 whois 库查询
            const data = await whoisLookup(domain);

            // 截取前 2000 个字符避免消息过长
            const truncatedData = data.length > 2000 ? data.substring(0, 2000) + '\n...(已截断)' : data;

            await ctx.reply(`🌐 *Whois 查询结果: ${domain}*\n\n\`\`\`\n${truncatedData}\n\`\`\``, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Whois error:', err);
            await ctx.reply(`❌ 查询失败: ${err.message || '未知错误'}`);
        }
    });
}

module.exports = { setupNetworkCommand };
