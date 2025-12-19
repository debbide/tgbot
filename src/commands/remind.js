const { reminderDb } = require('../db');

// 解析时间字符串
function parseTimeString(timeStr) {
    const now = new Date();

    // 相对时间格式: 30m, 2h, 1d
    const relativeMatch = timeStr.match(/^(\d+)([mhd])$/i);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        const ms = {
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
        };
        return new Date(now.getTime() + value * ms[unit]);
    }

    // 绝对时间格式: HH:MM
    const absoluteMatch = timeStr.match(/^(\d{1,2})[:：](\d{2})$/);
    if (absoluteMatch) {
        const hour = parseInt(absoluteMatch[1]);
        const minute = parseInt(absoluteMatch[2]);
        const target = new Date(now);
        target.setHours(hour, minute, 0, 0);

        // 如果时间已过，设为明天
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }
        return target;
    }

    // 日期时间格式: MM-DD HH:MM 或 YYYY-MM-DD HH:MM
    const dateTimeMatch = timeStr.match(/^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})\s+(\d{1,2})[:：](\d{2})$/);
    if (dateTimeMatch) {
        const year = dateTimeMatch[1] ? parseInt(dateTimeMatch[1]) : now.getFullYear();
        const month = parseInt(dateTimeMatch[2]) - 1;
        const day = parseInt(dateTimeMatch[3]);
        const hour = parseInt(dateTimeMatch[4]);
        const minute = parseInt(dateTimeMatch[5]);
        return new Date(year, month, day, hour, minute);
    }

    // 中文日期格式: YYYY年MM月DD日 HH:mm 或 YYYY年MM月DD日HH时mm分
    // 支持: 2025年12月25日 10:30, 12月25日10点30分, 2025年12月25日10时30分
    const chineseMatch = timeStr.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[点时:：](\d{2})分?$/);
    if (chineseMatch) {
        const year = chineseMatch[1] ? parseInt(chineseMatch[1]) : now.getFullYear();
        const month = parseInt(chineseMatch[2]) - 1;
        const day = parseInt(chineseMatch[3]);
        const hour = parseInt(chineseMatch[4]);
        const minute = parseInt(chineseMatch[5]);
        return new Date(year, month, day, hour, minute);
    }

    return null;
}

function setupRemindCommand(bot) {
    // /remind <时间> <内容>
    // /remind list
    // /remind del <ID>
    bot.command('remind', (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);

        if (args.length === 0) {
            return ctx.reply(
                '❌ 用法:\n' +
                '• /remind <时间> <内容> - 添加提醒\n' +
                '• /remind list - 查看列表\n' +
                '• /remind del <ID> - 删除提醒\n\n' +
                '📅 时间格式示例:\n' +
                '• 30m (30分钟后)\n' +
                '• 10:00 (今天或明天10点)\n' +
                '• 2025年12月25日 10:00 (指定年月日)\n' +
                '• 12月25日 10:00 (指定月日)'
            );
        }

        const subCommand = args[0].toLowerCase();

        // 查看列表
        if (subCommand === 'list') {
            return listReminders(ctx);
        }

        // 删除提醒
        if (subCommand === 'del' || subCommand === 'delete') {
            const id = parseInt(args[1]);
            if (!id) return ctx.reply('❌ 请指定要删除的提醒 ID，例如: /remind del 1');
            return deleteReminder(ctx, id);
        }

        // 添加提醒
        // 尝试解析时间
        let timeStr = args[0];
        let message = args.slice(1).join(' ');
        let remindAt = parseTimeString(timeStr);

        // 如果第一个参数解析失败，或者解析出来的时间没有包含具体时间（比如只解析了日期，但我们需要精确时间），
        // 尝试组合前两个参数 (例如 "2025-12-25 10:00")
        if (!remindAt && args.length >= 2) {
            const combinedTimeStr = args[0] + ' ' + args[1];
            const combinedRemindAt = parseTimeString(combinedTimeStr);

            if (combinedRemindAt) {
                timeStr = combinedTimeStr;
                remindAt = combinedRemindAt;
                message = args.slice(2).join(' ');
            }
        }

        if (!remindAt) {
            return ctx.reply('❌ 无法识别时间格式，请参考 /remind 帮助');
        }

        if (remindAt <= new Date()) {
            return ctx.reply('❌ 提醒时间必须在未来');
        }

        const result = reminderDb.add(
            ctx.from.id.toString(),
            ctx.chat.id.toString(),
            message,
            Math.floor(remindAt.getTime() / 1000)
        );

        const timeDisplay = remindAt.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        ctx.reply(
            `✅ 提醒已设置\n\n` +
            `📅 时间: ${timeDisplay}\n` +
            `📝 内容: ${message}\n` +
            `🔖 ID: ${result.lastInsertRowid}`
        );
    });

    // 保持兼容旧命令
    bot.command('reminders', (ctx) => listReminders(ctx));
    bot.command('delremind', (ctx) => {
        const id = parseInt(ctx.message.text.split(' ')[1]);
        if (!id) return ctx.reply('❌ 用法: /delremind <ID>');
        deleteReminder(ctx, id);
    });
}

function listReminders(ctx) {
    const reminders = reminderDb.listByUser(ctx.from.id.toString());

    if (reminders.length === 0) {
        return ctx.reply('📭 暂无待办提醒');
    }

    const list = reminders.map((r) => {
        const time = new Date(r.remind_at * 1000).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        return `🔖 #${r.id} | ${time}\n   ${r.message}`;
    }).join('\n\n');

    ctx.reply(`⏰ *待办提醒*\n\n${list}\n\n使用 /remind del <ID> 删除`, { parse_mode: 'Markdown' });
}

function deleteReminder(ctx, id) {
    const result = reminderDb.delete(id, ctx.from.id.toString());

    if (result.changes > 0) {
        ctx.reply(`✅ 提醒 #${id} 已删除`);
    } else {
        ctx.reply(`❌ 未找到提醒 #${id}`);
    }
}

module.exports = { setupRemindCommand, parseTimeString };
