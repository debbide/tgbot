const { noteDb } = require('../db');

function setupNoteCommand(bot) {
    // /note <内容> - 添加备忘
    bot.command('note', (ctx) => {
        const content = ctx.message.text.split(' ').slice(1).join(' ');

        if (!content) {
            return ctx.reply('❌ 用法: /note <内容>\n例: /note 明天买菜');
        }

        const result = noteDb.add(ctx.from.id.toString(), content);

        ctx.reply(`✅ 备忘已保存 (ID: ${result.lastInsertRowid})\n📝 ${content}`);
    });

    // /notes - 查看备忘列表
    bot.command('notes', (ctx) => {
        const notes = noteDb.list(ctx.from.id.toString(), 15);

        if (notes.length === 0) {
            return ctx.reply('📭 暂无备忘');
        }

        const list = notes.map((n) => {
            const time = new Date(n.created_at * 1000).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
            return `🔖 #${n.id} | ${time}\n   ${n.content.substring(0, 50)}${n.content.length > 50 ? '...' : ''}`;
        }).join('\n\n');

        ctx.reply(`📝 *备忘录*\n\n${list}\n\n使用 /delnote <ID> 删除`, { parse_mode: 'Markdown' });
    });

    // /delnote <ID> - 删除备忘
    bot.command('delnote', (ctx) => {
        const id = parseInt(ctx.message.text.split(' ')[1]);

        if (!id) {
            return ctx.reply('❌ 用法: /delnote <ID>');
        }

        const result = noteDb.delete(id, ctx.from.id.toString());

        if (result.changes > 0) {
            ctx.reply(`✅ 备忘 #${id} 已删除`);
        } else {
            ctx.reply(`❌ 未找到备忘 #${id}`);
        }
    });

    // /clearnotes - 清空所有备忘
    bot.command('clearnotes', (ctx) => {
        const result = noteDb.clear(ctx.from.id.toString());
        ctx.reply(`✅ 已清空 ${result.changes} 条备忘`);
    });
}

module.exports = { setupNoteCommand };
