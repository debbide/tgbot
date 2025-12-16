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
    const absoluteMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
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
    const dateTimeMatch = timeStr.match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (dateTimeMatch) {
        const year = dateTimeMatch[1] ? parseInt(dateTimeMatch[1]) : now.getFullYear();
        const month = parseInt(dateTimeMatch[2]) - 1;
        const day = parseInt(dateTimeMatch[3]);
        const hour = parseInt(dateTimeMatch[4]);
        const minute = parseInt(dateTimeMatch[5]);
        return new Date(year, month, day, hour, minute);
    }

    return null;
}

function setupRemindCommand(bot) {
    // /remind <时间> <内容>
    bot.command('remind', (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 2) {
            return ctx.reply(
                '❌ 用法: /remind <时间> <内容>\n\n' +
                '📅 时间格式:\n' +
                '• 30m - 30分钟后\n' +
                '• 2h - 2小时后\n' +
                '• 1d - 1天后\n' +
                '• 10:00 - 今天(或明天)10:00\n' +
                '• 12-25 10:00 - 12月25日10:00'
            );
        }

        const timeStr = args[0];
        const message = args.slice(1).join(' ');
        const remindAt = parseTimeString(timeStr);

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

    // 查看提醒列表
    bot.command('reminders', (ctx) => {
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

        ctx.reply(`⏰ *待办提醒*\n\n${list}\n\n使用 /delremind <ID> 删除`, { parse_mode: 'Markdown' });
    });

    // 删除提醒
    bot.command('delremind', (ctx) => {
        const id = parseInt(ctx.message.text.split(' ')[1]);

        if (!id) {
            return ctx.reply('❌ 用法: /delremind <ID>');
        }

        const result = reminderDb.delete(id, ctx.from.id.toString());

        if (result.changes > 0) {
            ctx.reply(`✅ 提醒 #${id} 已删除`);
        } else {
            ctx.reply(`❌ 未找到提醒 #${id}`);
        }
    });
}

module.exports = { setupRemindCommand, parseTimeString };
