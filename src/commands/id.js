function setupIdCommand(bot) {
    bot.command('id', (ctx) => {
        const user = ctx.from;
        const chat = ctx.chat;

        let message = `👤 *用户信息*\n`;
        message += `├ ID: \`${user.id}\`\n`;
        message += `├ 用户名: ${user.username ? '@' + user.username : '无'}\n`;
        message += `├ 名字: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n`;
        message += `└ 语言: ${user.language_code || '未知'}\n`;

        message += `\n💬 *聊天信息*\n`;
        message += `├ ID: \`${chat.id}\`\n`;
        message += `├ 类型: ${getChatType(chat.type)}\n`;

        if (chat.type !== 'private') {
            message += `├ 名称: ${chat.title || '未知'}\n`;
            if (chat.username) {
                message += `└ 用户名: @${chat.username}\n`;
            } else {
                message += `└ 用户名: 无\n`;
            }
        } else {
            message += `└ 私聊\n`;
        }

        ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // 回复消息获取被回复用户的ID
    bot.command('getid', (ctx) => {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ 请回复一条消息来获取该用户的 ID\n\n或使用 /id 获取当前聊天信息');
        }

        const target = ctx.message.reply_to_message.from;

        let message = `👤 *被回复用户信息*\n`;
        message += `├ ID: \`${target.id}\`\n`;
        message += `├ 用户名: ${target.username ? '@' + target.username : '无'}\n`;
        message += `├ 名字: ${target.first_name}${target.last_name ? ' ' + target.last_name : ''}\n`;
        message += `└ 是机器人: ${target.is_bot ? '是' : '否'}`;

        ctx.reply(message, { parse_mode: 'Markdown' });
    });
}

function getChatType(type) {
    const types = {
        private: '私聊',
        group: '群组',
        supergroup: '超级群组',
        channel: '频道',
    };
    return types[type] || type;
}

module.exports = { setupIdCommand };
