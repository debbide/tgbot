const translate = require('google-translate-api-x');

async function translateText(text, targetLang = 'zh-CN') {
    try {
        const result = await translate(text, { to: targetLang });
        return {
            success: true,
            text: result.text,
            from: result.from.language.iso,
            to: targetLang,
        };
    } catch (error) {
        console.error('翻译错误:', error.message);
        return { success: false, error: error.message };
    }
}

function setupTranslateCommand(bot) {
    // /tr [语言] <文本>
    bot.command('tr', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);

        if (args.length === 0) {
            return ctx.reply('❌ 用法: /tr <文本> 或 /tr <语言代码> <文本>\n例: /tr Hello World\n例: /tr ja 你好');
        }

        // 检查第一个参数是否是语言代码 (2-5个字母)
        let targetLang = 'zh-CN';
        let textToTranslate;

        if (args[0].match(/^[a-z]{2}(-[A-Z]{2})?$/i) && args.length > 1) {
            targetLang = args[0];
            textToTranslate = args.slice(1).join(' ');
        } else {
            textToTranslate = args.join(' ');
        }

        const loading = await ctx.reply('🔄 正在翻译...');

        const result = await translateText(textToTranslate, targetLang);

        if (result.success) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `🌐 *翻译结果*\n\n` +
                `📝 原文 (${result.from}):\n${textToTranslate}\n\n` +
                `✅ 译文 (${result.to}):\n${result.text}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `❌ 翻译失败: ${result.error}`
            );
        }
    });

    // 回复消息直接翻译
    bot.hears(/^翻译$/, async (ctx) => {
        if (!ctx.message.reply_to_message?.text) {
            return ctx.reply('❌ 请回复一条消息并发送"翻译"');
        }

        const text = ctx.message.reply_to_message.text;
        const result = await translateText(text);

        if (result.success) {
            ctx.reply(
                `🌐 *翻译结果*\n\n${result.text}`,
                { parse_mode: 'Markdown', reply_to_message_id: ctx.message.reply_to_message.message_id }
            );
        } else {
            ctx.reply(`❌ 翻译失败: ${result.error}`);
        }
    });
}

module.exports = { setupTranslateCommand, translateText };
