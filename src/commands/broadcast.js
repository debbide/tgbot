/**
 * 定时广播命令
 * 管理员定时发送消息到群组
 */

const { getSettings } = require('../settings');

// 内存中存储定时任务 (重启后需管理员重新设置)
const broadcasts = new Map();

function setupBroadcastCommand(bot, isAdmin) {
    // 广播命令
    bot.command('broadcast', async (ctx) => {
        if (!isAdmin(ctx)) {
            return ctx.reply('⛔ 仅管理员可使用此命令');
        }

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length === 0) {
            const list = Array.from(broadcasts.values());
            let msg = '📢 *定时广播管理*\n\n';

            if (list.length === 0) {
                msg += '暂无定时任务\n\n';
            } else {
                list.forEach((b, i) => {
                    msg += `${i + 1}. 群组: \`${b.chatId}\`\n`;
                    msg += `   间隔: ${b.intervalMin} 分钟\n`;
                    msg += `   消息: ${b.message.slice(0, 30)}...\n\n`;
                });
            }

            msg += '用法:\n';
            msg += '`/broadcast add <群组ID> <间隔分钟> <消息>`\n';
            msg += '`/broadcast del <编号>`\n';
            msg += '`/broadcast send <群组ID> <消息>` - 立即发送';

            return ctx.reply(msg, { parse_mode: 'Markdown' });
        }

        const action = args[0].toLowerCase();

        // 立即发送
        if (action === 'send') {
            const chatId = args[1];
            const message = args.slice(2).join(' ');

            if (!chatId || !message) {
                return ctx.reply('❌ 格式: `/broadcast send <群组ID> <消息>`', { parse_mode: 'Markdown' });
            }

            try {
                await bot.telegram.sendMessage(chatId, message);
                return ctx.reply(`✅ 已发送到 \`${chatId}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                return ctx.reply(`❌ 发送失败: ${err.message}`);
            }
        }

        // 添加定时任务
        if (action === 'add') {
            const chatId = args[1];
            const intervalMin = parseInt(args[2]);
            const message = args.slice(3).join(' ');

            if (!chatId || !intervalMin || !message) {
                return ctx.reply('❌ 格式: `/broadcast add <群组ID> <间隔分钟> <消息>`', { parse_mode: 'Markdown' });
            }

            if (intervalMin < 1) {
                return ctx.reply('❌ 间隔不能少于 1 分钟');
            }

            const id = Date.now().toString(36);
            const timer = setInterval(async () => {
                try {
                    await bot.telegram.sendMessage(chatId, message);
                    console.log(`📢 定时广播已发送到 ${chatId}`);
                } catch (err) {
                    console.error(`📢 广播失败 ${chatId}:`, err.message);
                }
            }, intervalMin * 60 * 1000);

            broadcasts.set(id, { id, chatId, intervalMin, message, timer });

            // 立即发送一次
            try {
                await bot.telegram.sendMessage(chatId, message);
            } catch (err) {
                return ctx.reply(`⚠️ 已设置定时任务，但首次发送失败: ${err.message}`);
            }

            return ctx.reply(
                `✅ 定时广播已设置\n\n` +
                `群组: \`${chatId}\`\n` +
                `间隔: ${intervalMin} 分钟\n` +
                `ID: \`${id}\``,
                { parse_mode: 'Markdown' }
            );
        }

        // 删除定时任务
        if (action === 'del' || action === 'delete') {
            const list = Array.from(broadcasts.values());
            const index = parseInt(args[1]) - 1;

            if (isNaN(index) || index < 0 || index >= list.length) {
                return ctx.reply('❌ 请提供有效的任务编号');
            }

            const task = list[index];
            clearInterval(task.timer);
            broadcasts.delete(task.id);

            return ctx.reply(`✅ 已删除定时任务 #${index + 1}`);
        }

        // 列出任务
        if (action === 'list') {
            const list = Array.from(broadcasts.values());
            if (list.length === 0) {
                return ctx.reply('📢 暂无定时任务');
            }

            let msg = '📢 *定时广播任务*\n\n';
            list.forEach((b, i) => {
                msg += `${i + 1}. 群组: \`${b.chatId}\`\n`;
                msg += `   间隔: ${b.intervalMin} 分钟\n`;
                msg += `   消息: ${b.message.slice(0, 50)}...\n\n`;
            });

            return ctx.reply(msg, { parse_mode: 'Markdown' });
        }
    });
}

// 停止所有广播任务 (用于 Bot 重启)
function stopAllBroadcasts() {
    for (const task of broadcasts.values()) {
        clearInterval(task.timer);
    }
    broadcasts.clear();
}

module.exports = { setupBroadcastCommand, stopAllBroadcasts };
