/**
 * 群组管理命令
 * 欢迎语和关键词自动回复
 */

const { groupDb } = require('../db');

function setupGroupCommand(bot, isAdmin) {
    // 设置欢迎语
    bot.command('welcome', async (ctx) => {
        // 仅群组可用
        if (ctx.chat.type === 'private') {
            return ctx.reply('⚠️ 此命令仅在群组中可用');
        }

        // 检查是否为管理员
        if (!isAdmin(ctx)) {
            try {
                const member = await ctx.getChatMember(ctx.from.id);
                if (!['creator', 'administrator'].includes(member.status)) {
                    return ctx.reply('⛔ 仅群组管理员可使用此命令');
                }
            } catch {
                return ctx.reply('⛔ 无法验证管理员权限');
            }
        }

        const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
        const chatId = ctx.chat.id;

        if (!args) {
            const config = groupDb.getConfig(chatId);
            if (config?.welcome_message) {
                return ctx.reply(
                    `📋 *当前欢迎语*\n\n${config.welcome_message}\n\n` +
                    '用法:\n' +
                    '`/welcome <消息>` - 设置欢迎语\n' +
                    '`/welcome off` - 关闭欢迎语\n\n' +
                    '支持变量: `{name}` `{username}` `{group}`',
                    { parse_mode: 'Markdown' }
                );
            }
            return ctx.reply(
                '📋 *设置入群欢迎语*\n\n' +
                '用法:\n' +
                '`/welcome <消息>` - 设置欢迎语\n' +
                '`/welcome off` - 关闭欢迎语\n\n' +
                '支持变量: `{name}` `{username}` `{group}`',
                { parse_mode: 'Markdown' }
            );
        }

        if (args.toLowerCase() === 'off') {
            groupDb.deleteWelcome(chatId);
            return ctx.reply('✅ 已关闭入群欢迎语');
        }

        groupDb.setWelcome(chatId, args);
        return ctx.reply('✅ 欢迎语已设置');
    });

    // 关键词回复管理
    bot.command('keyword', async (ctx) => {
        if (ctx.chat.type === 'private') {
            return ctx.reply('⚠️ 此命令仅在群组中可用');
        }

        if (!isAdmin(ctx)) {
            try {
                const member = await ctx.getChatMember(ctx.from.id);
                if (!['creator', 'administrator'].includes(member.status)) {
                    return ctx.reply('⛔ 仅群组管理员可使用此命令');
                }
            } catch {
                return ctx.reply('⛔ 无法验证管理员权限');
            }
        }

        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;

        if (args.length === 0) {
            const keywords = groupDb.getKeywords(chatId);
            if (keywords.length === 0) {
                return ctx.reply(
                    '📋 *关键词自动回复*\n\n' +
                    '暂无关键词规则\n\n' +
                    '用法:\n' +
                    '`/keyword add <关键词> | <回复>` - 添加\n' +
                    '`/keyword del <ID>` - 删除\n' +
                    '`/keyword list` - 列表',
                    { parse_mode: 'Markdown' }
                );
            }
            const list = keywords.map(k => `• [${k.id}] \`${k.keyword}\` → ${k.reply.slice(0, 20)}...`).join('\n');
            return ctx.reply(`📋 *关键词列表*\n\n${list}`, { parse_mode: 'Markdown' });
        }

        const action = args[0].toLowerCase();

        if (action === 'add') {
            const content = args.slice(1).join(' ');
            const parts = content.split('|').map(p => p.trim());
            if (parts.length < 2) {
                return ctx.reply('❌ 格式: `/keyword add 关键词 | 回复内容`', { parse_mode: 'Markdown' });
            }
            groupDb.addKeyword(chatId, parts[0], parts[1]);
            return ctx.reply(`✅ 已添加关键词: \`${parts[0]}\``, { parse_mode: 'Markdown' });
        }

        if (action === 'del' || action === 'delete') {
            const id = parseInt(args[1]);
            if (!id) return ctx.reply('❌ 请提供关键词 ID');
            groupDb.deleteKeyword(chatId, id);
            return ctx.reply(`✅ 已删除关键词 #${id}`);
        }

        if (action === 'list') {
            const keywords = groupDb.getKeywords(chatId);
            if (keywords.length === 0) {
                return ctx.reply('📋 暂无关键词规则');
            }
            const list = keywords.map(k => `• [${k.id}] \`${k.keyword}\` → ${k.reply}`).join('\n');
            return ctx.reply(`📋 *关键词列表*\n\n${list}`, { parse_mode: 'Markdown' });
        }
    });

    // 新成员加入监听
    bot.on('new_chat_members', async (ctx) => {
        const config = groupDb.getConfig(ctx.chat.id);
        if (!config?.welcome_message) return;

        for (const member of ctx.message.new_chat_members) {
            if (member.is_bot) continue;

            let message = config.welcome_message
                .replace(/{name}/g, member.first_name || '新朋友')
                .replace(/{username}/g, member.username ? `@${member.username}` : member.first_name)
                .replace(/{group}/g, ctx.chat.title || '群组');

            try {
                await ctx.reply(message);
            } catch (e) {
                console.error('发送欢迎语失败:', e.message);
            }
        }
    });

    // 关键词匹配监听
    bot.on('text', async (ctx, next) => {
        // 跳过私聊和命令
        if (ctx.chat.type === 'private' || ctx.message.text.startsWith('/')) {
            return next();
        }

        const keywords = groupDb.getKeywords(ctx.chat.id);
        if (keywords.length === 0) return next();

        const text = ctx.message.text.toLowerCase();
        for (const kw of keywords) {
            if (text.includes(kw.keyword.toLowerCase())) {
                try {
                    await ctx.reply(kw.reply, { reply_to_message_id: ctx.message.message_id });
                } catch (e) {
                    console.error('关键词回复失败:', e.message);
                }
                break; // 只触发第一个匹配
            }
        }

        return next();
    });
}

module.exports = { setupGroupCommand };
